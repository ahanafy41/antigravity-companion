"""Bounded independent MCP connection checks from CLI-owned configuration."""

import asyncio
import contextlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

import aiohttp

from cli_client import CLIUnavailable, terminate_process
from mcp_settings import reject_linked_path

LIMIT = 1024 * 1024
VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
NAME = re.compile(r"[\w.-]{1,128}")


class ProbeFailure(Exception):
    """A sanitized MCP protocol boundary failure."""


class AuthenticationRequired(ProbeFailure):
    """Credentials must be handled by the native CLI."""


def read_configuration(path):
    reject_linked_path(path)
    try:
        with path.open("rb") as stream:
            raw = stream.read(LIMIT + 1)
    except FileNotFoundError:
        return {}
    if len(raw) > LIMIT:
        raise ProbeFailure("MCP configuration exceeds its size limit")
    try:
        document = json.loads(raw.decode("utf-8-sig"))
    except (ValueError, UnicodeError) as failure:
        raise ProbeFailure("MCP configuration is invalid") from failure
    entries = (
        document.get("mcpServers") if isinstance(document, dict) else None
    )
    if not isinstance(entries, dict):
        raise ProbeFailure("MCP configuration has no server object")
    return entries


def response_result(message, identifier):
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        raise ProbeFailure("MCP response is invalid")
    if (
        isinstance(message.get("id"), bool)
        or message.get("id") != identifier
        or "error" in message
    ):
        raise ProbeFailure("MCP request was not accepted")
    result = message.get("result")
    if not isinstance(result, dict):
        raise ProbeFailure("MCP result is invalid")
    return result


async def bounded_body(response):
    data = bytearray()
    async for chunk in response.content.iter_chunked(16384):
        data.extend(chunk)
        if len(data) > LIMIT:
            raise ProbeFailure("MCP response exceeds its size limit")
    return bytes(data)


async def stream_result(response, identifier):
    total = 0
    lines = []
    async for raw_line in response.content:
        total += len(raw_line)
        if total > LIMIT:
            raise ProbeFailure("MCP response exceeds its size limit")
        line = raw_line.decode("utf-8").rstrip("\r\n")
        if line.startswith("data:"):
            lines.append(line[5:].lstrip())
        elif not line and lines:
            message = json.loads("\n".join(lines))
            lines = []
            if isinstance(message, dict) and "id" in message:
                return response_result(message, identifier)
    raise ProbeFailure("MCP stream ended without a result")


class HTTPTransport:
    def __init__(self, session, config):
        self.session = session
        self.url = config["serverUrl"]
        address = urlsplit(self.url)
        if (
            address.scheme not in ("http", "https")
            or not address.hostname
            or address.username
            or address.password
            or address.fragment
        ):
            raise ProbeFailure("Invalid MCP endpoint")
        if address.scheme == "http" and address.hostname not in (
            "localhost",
            "127.0.0.1",
            "::1",
        ):
            raise ProbeFailure("Remote MCP endpoints require HTTPS")
        self.headers = dict(config.get("headers", {}))
        if not all(
            isinstance(key, str)
            and isinstance(value, str)
            and "\r" not in key + value
            and "\n" not in key + value
            for key, value in self.headers.items()
        ):
            raise ProbeFailure("Invalid MCP headers")
        self.headers.update(Accept="application/json, text/event-stream")
        self.identifier = 0
        self.session_id = None

    async def send(self, method, params=None, notification=False):
        message = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        if not notification:
            self.identifier += 1
            message["id"] = self.identifier
        async with self.session.post(
            self.url, json=message, headers=self.headers, allow_redirects=False
        ) as response:
            if response.status == 401:
                raise AuthenticationRequired(
                    "Native MCP authentication needed"
                )
            if not 200 <= response.status < 300:
                raise ProbeFailure("MCP endpoint rejected the request")
            session_id = response.headers.get("Mcp-Session-Id")
            if session_id:
                if len(session_id) > 256 or any(
                    ord(char) < 33 or ord(char) > 126 for char in session_id
                ):
                    raise ProbeFailure("Invalid MCP session identifier")
                if self.session_id and self.session_id != session_id:
                    raise ProbeFailure("MCP session identifier changed")
                self.session_id = session_id
                self.headers["Mcp-Session-Id"] = session_id
            if notification:
                return None
            content_type = response.headers.get("Content-Type", "")
            if "text/event-stream" in content_type:
                return await stream_result(response, self.identifier)
            if "application/json" not in content_type:
                raise ProbeFailure("Unsupported MCP response type")
            data = await bounded_body(response)
            return response_result(json.loads(data), self.identifier)

    async def close(self):
        if self.session_id:
            with contextlib.suppress(
                aiohttp.ClientError, asyncio.TimeoutError
            ):
                async with self.session.delete(
                    self.url,
                    headers=self.headers,
                    allow_redirects=False,
                    timeout=aiohttp.ClientTimeout(total=1),
                ):
                    pass


class StdioTransport:
    def __init__(self, process):
        self.process = process
        self.identifier = 0
        self.errors = asyncio.create_task(self.drain_errors())

    async def drain_errors(self):
        total = 0
        while True:
            chunk = await self.process.stderr.read(16384)
            if not chunk:
                return
            total += len(chunk)
            if total > LIMIT:
                raise ProbeFailure("MCP diagnostic stream exceeded its limit")

    async def send(self, method, params=None, notification=False):
        message = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            message["params"] = params
        if not notification:
            self.identifier += 1
            message["id"] = self.identifier
        self.process.stdin.write(json.dumps(message).encode() + b"\n")
        await self.process.stdin.drain()
        if notification:
            return None
        for _ in range(64):
            if self.errors.done():
                self.errors.result()
            line = await self.process.stdout.readline()
            if not line or len(line) > LIMIT:
                raise ProbeFailure("MCP stdout is incomplete or too large")
            payload = json.loads(line)
            if not isinstance(payload, dict):
                raise ProbeFailure("Invalid MCP message")
            if "id" in payload:
                return response_result(payload, self.identifier)
        raise ProbeFailure("MCP sent too many unsolicited messages")

    async def close(self):
        self.errors.cancel()
        with contextlib.suppress(asyncio.CancelledError, ProbeFailure):
            await self.errors
        await terminate_process(self.process)
        if self.process.stdin:
            self.process.stdin.close()


async def handshake(transport):
    initialized = await transport.send(
        "initialize",
        {
            "protocolVersion": VERSIONS[0],
            "capabilities": {},
            "clientInfo": {
                "name": "companion-connection-probe",
                "version": "1",
            },
        },
    )
    version = initialized.get("protocolVersion")
    if version not in VERSIONS:
        raise ProbeFailure("Unsupported MCP protocol version")
    if isinstance(transport, HTTPTransport):
        transport.headers["MCP-Protocol-Version"] = version
    capabilities = initialized.get("capabilities")
    if not isinstance(capabilities, dict):
        raise ProbeFailure("Invalid MCP capabilities")
    await transport.send("notifications/initialized", notification=True)
    count = 0
    if "tools" in capabilities:
        params = {}
        for _ in range(8):
            result = await transport.send("tools/list", params)
            tools = result.get("tools")
            if not isinstance(tools, list) or any(
                not isinstance(tool, dict)
                or not isinstance(tool.get("name"), str)
                or not tool["name"]
                or not isinstance(tool.get("inputSchema"), dict)
                for tool in tools
            ):
                raise ProbeFailure("Invalid MCP tool list")
            count += len(tools)
            if count > 4096:
                raise ProbeFailure("MCP tool list exceeds its size limit")
            cursor = result.get("nextCursor")
            if cursor is None:
                break
            if not isinstance(cursor, str) or len(cursor) > 1024:
                raise ProbeFailure("Invalid MCP pagination cursor")
            params = {"cursor": cursor}
        else:
            raise ProbeFailure("MCP tool list has too many pages")
    return {
        "status": "connected",
        "tool_count": count,
        "protocol_version": version,
        "cli_connection_verified": False,
    }


class MCPProbe:
    def __init__(self, home=None, timeout=20):
        self.home = Path(home) if home else Path.home()
        self.timeout = min(20, max(0.1, timeout))

    def configuration(self, name, cwd):
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("Invalid configured MCP server name")
        entries = read_configuration(
            self.home / ".gemini" / "config" / "mcp_config.json"
        )
        entries.update(
            read_configuration(Path(cwd) / ".agents" / "mcp_config.json")
        )
        config = entries.get(name)
        if config is not None and not isinstance(config, dict):
            raise ProbeFailure("Invalid MCP server configuration")
        return config

    async def test(self, name, cwd):
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("Invalid configured MCP server name")
        try:
            config = self.configuration(name, cwd)
            if config is None:
                return {"status": "not_configured"}
            if config.get("disabled", False):
                return {"status": "disabled"}
            return await asyncio.wait_for(self.run(config, cwd), self.timeout)
        except AuthenticationRequired:
            return {"status": "auth_required", "action": "mcp_cli"}
        except asyncio.TimeoutError:
            return {"status": "timeout"}
        except (
            ProbeFailure,
            CLIUnavailable,
            OSError,
            ValueError,
            TypeError,
            aiohttp.ClientError,
        ):
            return {
                "status": "failed",
                "reason": "MCP connection check failed",
            }

    async def run(self, config, cwd):
        if "serverUrl" in config:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.timeout),
                trust_env=False,
            ) as session:
                transport = HTTPTransport(session, config)
                try:
                    return await handshake(transport)
                finally:
                    await transport.close()
        command = config.get("command")
        arguments = config.get("args", [])
        environment = config.get("env", {})
        if (
            not isinstance(command, str)
            or not command
            or "\x00" in command
            or not isinstance(arguments, list)
            or not all(
                isinstance(arg, str) and "\x00" not in arg for arg in arguments
            )
            or not isinstance(environment, dict)
            or not all(
                isinstance(key, str)
                and isinstance(value, str)
                and "\x00" not in key + value
                and "=" not in key
                for key, value in environment.items()
            )
        ):
            raise ProbeFailure("Invalid stdio MCP configuration")
        options = {"start_new_session": True} if os.name == "posix" else {}
        process = await asyncio.create_subprocess_exec(
            command,
            *arguments,
            cwd=str(config.get("cwd", cwd)),
            env={**os.environ, **environment},
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=LIMIT + 1,
            **options
        )
        if os.name == "posix":
            process._companion_pgid = process.pid
        transport = StdioTransport(process)
        try:
            return await handshake(transport)
        finally:
            await transport.close()
