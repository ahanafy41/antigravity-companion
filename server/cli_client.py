"""CLI-owned administration and bounded subprocess transport."""

import asyncio
import os
import re
import shutil
import signal
from pathlib import Path
from cli_catalog import local_catalog, toggle_skill

MAX_LINE = 1024 * 1024
GROUP_SHUTDOWN_TIMEOUT = 5
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


class CLIUnavailable(Exception):
    """The CLI cannot provide this capability safely."""


async def terminate_process(process):
    if os.name == "nt":
        if process.returncode is None:
            await terminate_windows_tree(process)
        return
    group_id = getattr(process, "_companion_pgid", None)
    if group_id is None:
        raise CLIUnavailable("Owned process group identity is unavailable")
    if not getattr(process, "_companion_group_closed", False):
        await terminate_posix_group(group_id)
        # A retired group ID must never be signalled after reuse.
        process._companion_group_closed = True
    try:
        await asyncio.wait_for(process.wait(), GROUP_SHUTDOWN_TIMEOUT)
    except asyncio.TimeoutError as failure:
        raise CLIUnavailable("Owned process exit is unconfirmed") from failure


async def terminate_posix_group(group_id):
    try:
        for requested_signal in (signal.SIGTERM, signal.SIGKILL):
            if not process_group_alive(group_id):
                return
            try:
                os.killpg(group_id, requested_signal)
            except ProcessLookupError:
                return
            if await wait_for_group_exit(group_id):
                return
    except OSError as failure:
        raise CLIUnavailable(
            "Cannot inspect the owned process group"
        ) from failure
    raise CLIUnavailable("Owned process group cancellation is unconfirmed")


def process_group_alive(group_id):
    try:
        os.killpg(group_id, 0)
    except ProcessLookupError:
        return False
    return True


async def wait_for_group_exit(group_id):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + GROUP_SHUTDOWN_TIMEOUT
    while process_group_alive(group_id):
        remaining = deadline - loop.time()
        if remaining <= 0:
            return False
        await asyncio.sleep(min(0.05, remaining))
    return True


async def terminate_windows_tree(process):
    # taskkill needs the live parent to enumerate its owned descendants.
    terminator = await asyncio.create_subprocess_exec(
        "taskkill",
        "/PID",
        str(process.pid),
        "/T",
        "/F",
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        status = await asyncio.wait_for(terminator.wait(), 5)
        if status:
            raise CLIUnavailable(
                "Cannot confirm cancellation of the owned process tree"
            )
        await asyncio.wait_for(process.wait(), 5)
    except asyncio.TimeoutError as failure:
        if terminator.returncode is None:
            terminator.kill()
            await terminator.wait()
        raise CLIUnavailable(
            "Owned process tree cancellation timed out"
        ) from failure


async def bounded_read(stream):
    chunks = []
    total = 0
    while True:
        chunk = await stream.read(16384)
        if not chunk:
            return b"".join(chunks)
        total += len(chunk)
        if total > MAX_LINE:
            raise CLIUnavailable("CLI response exceeds the safety limit")
        chunks.append(chunk)


class CLI:
    def __init__(self):
        self.executable = shutil.which("agy")
        self.mutation_lock = asyncio.Lock()
        self.catalog_verbs = {}

    @property
    def available(self):
        return bool(self.executable)

    async def spawn(self, arguments, cwd):
        if not self.executable:
            raise CLIUnavailable("agy is not installed or is outside PATH")
        environment = dict(os.environ)
        environment["AGY_NO_UPDATE_CHECK"] = "1"
        environment["AGY_CLI_DISABLE_AUTO_UPDATE"] = "true"
        environment.pop("AGY_AUTO_UPDATE", None)
        options = {"start_new_session": True} if os.name == "posix" else {}
        try:
            process = await asyncio.create_subprocess_exec(
                self.executable,
                *arguments,
                cwd=str(cwd),
                env=environment,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=MAX_LINE + 1,
                **options
            )
            if os.name == "posix":
                # Keep group ownership after the CLI parent exits.
                process._companion_pgid = process.pid
            return process
        except OSError as failure:
            raise CLIUnavailable("Cannot start agy executable") from failure

    async def command(self, arguments, timeout=20, cwd=None):
        process = await self.spawn(
            arguments, Path(cwd) if cwd is not None else Path.home()
        )
        process.stdin.close()
        readers = asyncio.gather(
            bounded_read(process.stdout), bounded_read(process.stderr)
        )
        try:
            stdout, stderr = await asyncio.wait_for(readers, timeout)
            await asyncio.wait_for(process.wait(), 5)
        except asyncio.CancelledError:
            await terminate_process(process)
            raise
        except (asyncio.TimeoutError, CLIUnavailable):
            await terminate_process(process)
            raise CLIUnavailable("CLI command timed out or exceeded its limit")
        if process.returncode:
            raise CLIUnavailable(
                "CLI operation failed; check authentication in Termux"
            )
        output = stdout
        if arguments and arguments[-1] == "--help" and not stdout:
            output = stderr
        return ANSI.sub("", output.decode("utf-8", errors="replace"))

    async def catalog_actions(self, kind):
        if kind == "skills" and self.available:
            return ["enable", "disable"]
        if kind != "plugins" or not self.available:
            return []
        if kind not in self.catalog_verbs:
            help_text = await self.command(["plugin", "--help"])
            self.catalog_verbs[kind] = [
                verb
                for verb in ("enable", "disable")
                if re.search(r"^\s*" + verb + r"\s+", help_text, re.MULTILINE)
            ]
        return self.catalog_verbs[kind]

    async def mutate_catalog(self, kind, action, name, cwd=None):
        if not isinstance(name, str) or not re.fullmatch(
            r"[\w.@:/-]{1,128}", name
        ):
            raise ValueError("Invalid customization name")
        if name.startswith("-") or action not in await self.catalog_actions(
            kind
        ):
            raise CLIUnavailable(
                "CLI does not advertise this customization action"
            )
        async with self.mutation_lock:
            if kind == "skills":
                toggle_skill(name, action, cwd)
                return await self.listing(kind, cwd)
            await self.command(["plugin", action, name])
            return await self.listing(kind)

    async def listing(self, kind, cwd=None):
        if kind in ("skills", "commands"):
            if not self.available:
                raise CLIUnavailable("agy executable is unavailable")
            plugins = await self.listing("plugins")
            return local_catalog(kind, cwd, plugins)
        arguments = {
            "models": ["models"],
            "agents": ["agents"],
            "mcp": ["mcp", "list"],
            "plugins": ["plugin", "list", "--json"],
            "skills": ["skills", "list"],
            "commands": ["commands", "list"],
        }[kind]
        await self.command(arguments[:1] + ["--help"])
        output = (
            await self.command(arguments, cwd=cwd)
            if kind == "mcp" and cwd is not None
            else await self.command(arguments)
        )
        return parse_listing(output, kind, strict=True)

    async def mutate_mcp(self, action, request, cwd=None):
        name = request.get("name", "")
        if not isinstance(name, str) or not re.fullmatch(r"[\w.-]+", name):
            raise ValueError("Invalid MCP server name")
        async with self.mutation_lock:
            verb = "remove" if action == "delete" else action
            command_options = {} if cwd is None else {"cwd": cwd}
            help_text = await self.command(
                ["mcp", verb, "--help"], **command_options
            )
            arguments = ["mcp", verb]
            if verb == "add":
                arguments += mcp_add_flags(request, help_text)
                arguments += [name, request["commandOrUrl"]]
                arguments += request.get("args", [])
            else:
                arguments.append(name)
            await self.command(arguments, **command_options)
            return (
                await self.listing("mcp", cwd)
                if cwd is not None
                else await self.listing("mcp")
            )


def mcp_add_flags(request, help_text):
    transport = request.get("type", "stdio")
    if transport not in ("stdio", "http"):
        raise ValueError("MCP type must be stdio or http")
    command = request.get("commandOrUrl")
    if not isinstance(command, str) or not command.strip():
        raise ValueError("MCP commandOrUrl is required")
    if "--type" not in help_text:
        raise CLIUnavailable(
            "CLI does not advertise the required MCP type flag"
        )
    flags = ["--type", transport]
    for field, option in (("env", "--env"), ("headers", "--header")):
        entries = request.get(field, {})
        if not isinstance(entries, dict):
            raise ValueError("MCP env and headers must be objects")
        if entries and option not in help_text:
            raise CLIUnavailable("CLI does not advertise " + option)
        for key, value in entries.items():
            if not isinstance(value, str) or "\n" in key + value:
                raise ValueError("Invalid MCP environment or header")
            flags.extend(
                [option, key + ("=" if field == "env" else ": ") + value]
            )
    args = request.get("args", [])
    if not isinstance(args, list) or not all(
        isinstance(arg, str) for arg in args
    ):
        raise ValueError("MCP args must be a string array")
    return flags


def parse_listing(output, kind, strict=False):
    import json

    try:
        parsed = json.loads(output.lstrip("\ufeff"))
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, dict):
        parsed = parsed.get(kind, parsed.get("servers"))
    if isinstance(parsed, list):
        if not all(isinstance(entry, dict) for entry in parsed):
            raise CLIUnavailable("CLI list contains an invalid entry")
        if kind == "plugins":
            for entry in parsed:
                identifier = entry.get("id", entry.get("name"))
                if (
                    not isinstance(identifier, str)
                    or not re.fullmatch(r"[\w.@:/-]{1,128}", identifier)
                    or identifier.startswith("-")
                ):
                    raise CLIUnavailable("CLI plugin identifier is invalid")
            return [
                dict(entry, id=entry.get("id", entry.get("name")))
                for entry in parsed
            ]
        return parsed
    rows = []
    for line in output.splitlines():
        if kind == "models" and "Fetching available models..." in line:
            line = line.rsplit("Fetching available models...", 1)[-1]
        match = re.fullmatch(
            r"\s*([\w.:-]+)(?:\t+| {2,})([^\x00-\x1f]+)", line
        )
        if not match:
            continue
        identifier, label = match.groups()
        if identifier.lower() in ("id", "name", "model", "server", "usage"):
            continue
        key = "name" if kind == "mcp" else "id"
        rows.append(
            {key: identifier, "name" if key == "id" else "status": label}
        )
    if strict and (kind == "plugins" or (not rows and output.strip())):
        raise CLIUnavailable("CLI output is not a supported list format")
    return rows
