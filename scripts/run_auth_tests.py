"""Local protocol fixtures for native login handoff and MCP probes."""

import argparse
import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from aiohttp import web

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from auth_flow import AuthFlow  # noqa: E402
from mcp_probe import MCPProbe  # noqa: E402
from mcp_settings import MCPSettings  # noqa: E402
from storage import StorageConflict  # noqa: E402


class NativeAuthTests(unittest.TestCase):
    def test_handoff_does_not_claim_authenticated(self):
        flow = AuthFlow(True)
        result = flow.start("account")
        self.assertEqual(result["status"], "native_launch")
        self.assertEqual(result["action"], "login_cli")
        self.assertIsNone(flow.status()["authenticated"])
        self.assertEqual(result["command"], "agy")

    def test_mcp_auth_uses_actual_interactive_manager(self):
        flow = AuthFlow(True)
        result = flow.start("mcp", "configured-server")
        self.assertEqual(result["interactive_command"], "/mcp")
        self.assertEqual(result["server"], "configured-server")
        self.assertNotIn("auth", result["command"])

    def test_logout_handoff_preserves_unknown_account_and_selected_directory(
        self,
    ):
        flow = AuthFlow(True)
        result = flow.start("logout", cwd="/work/selected folder")
        self.assertEqual(result["status"], "native_launch")
        self.assertEqual(result["action"], "logout_cli")
        self.assertEqual(result["interactive_command"], "/logout")
        self.assertEqual(result["cwd"], "/work/selected folder")
        self.assertIsNone(result["authenticated"])
        self.assertIsNone(flow.status()["authenticated"])
        self.assertTrue(flow.status()["pending"])
        self.assertIn("account", result["reason"])
        self.assertEqual(
            flow.cancel(result["request_id"])["status"], "cancelled"
        )
        self.assertIsNone(flow.status()["authenticated"])

    def test_cancel_cannot_cancel_another_handoff(self):
        flow = AuthFlow(True)
        first = flow.start("account")
        second = flow.start("account")
        with self.assertRaises(ValueError):
            flow.cancel(first["request_id"])
        self.assertEqual(
            flow.cancel(second["request_id"])["status"], "cancelled"
        )
        self.assertFalse(flow.status()["pending"])

    def test_unavailable_cli_and_invalid_names(self):
        with self.assertRaises(ValueError):
            AuthFlow(True).start("mcp", "name\nsecret")
        with self.assertRaises(ValueError):
            AuthFlow(True).start("arbitrary-command")
        self.assertFalse(AuthFlow(False).status()["available"])
        self.assertEqual(
            AuthFlow(False).start("account")["status"], "unavailable"
        )


class OAuthSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.cwd = self.root / "workspace"
        self.cwd.mkdir()
        self.path = self.home / ".gemini" / "config" / "mcp_config.json"
        self.path.parent.mkdir(parents=True)
        self.original = {
            "unknown": {"keep": True},
            "mcpServers": {
                "fixture": {
                    "serverUrl": "https://example.invalid/mcp",
                    "headers": {"Authorization": "private"},
                    "oauth": {
                        "clientId": "old",
                        "clientSecret": "saved",
                        "unknown": 17,
                    },
                },
                "other": {"command": "keep"},
            },
        }
        self.path.write_text(json.dumps(self.original), encoding="utf-8-sig")
        self.settings = MCPSettings(self.home)

    def tearDown(self):
        self.temp.cleanup()

    def test_write_preserves_secrets_unknown_fields_and_backup(self):
        view = self.settings.read_oauth("fixture", self.cwd)
        self.assertNotIn("saved", json.dumps(view))
        updated = self.settings.write_oauth(
            "fixture",
            self.cwd,
            {"client_id": "new", "client_secret": ""},
            view["revision"],
        )
        document = json.loads(self.path.read_text())
        self.assertEqual(
            document["mcpServers"]["fixture"]["oauth"],
            {"clientId": "new", "clientSecret": "saved", "unknown": 17},
        )
        self.assertEqual(
            document["mcpServers"]["fixture"]["headers"],
            {"Authorization": "private"},
        )
        self.assertEqual(document["unknown"], self.original["unknown"])
        self.assertTrue(
            self.path.with_name(self.path.name + ".companion-bak").exists()
        )
        self.assertTrue(updated["has_client_secret"])
        with self.assertRaises(StorageConflict):
            self.settings.write_oauth(
                "fixture", self.cwd, {"client_id": "stale"}, view["revision"]
            )

    def test_secret_clear_requires_explicit_request(self):
        view = self.settings.read_oauth("fixture", self.cwd)
        self.settings.write_oauth(
            "fixture",
            self.cwd,
            {"clear_client_secret": True},
            view["revision"],
        )
        document = json.loads(self.path.read_text())
        self.assertNotIn(
            "clientSecret", document["mcpServers"]["fixture"]["oauth"]
        )

    def test_workspace_owner_selected_without_global_overwrite(self):
        workspace_path = self.cwd / ".agents" / "mcp_config.json"
        workspace_path.parent.mkdir()
        workspace_path.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "fixture": {
                            "serverUrl": "https://workspace.invalid/mcp"
                        }
                    }
                }
            )
        )
        view = self.settings.read_oauth("fixture", self.cwd)
        self.assertEqual(view["scope"], "workspace")
        original_global = self.path.read_bytes()
        self.settings.write_oauth(
            "fixture", self.cwd, {"client_id": "workspace"}, view["revision"]
        )
        self.assertEqual(self.path.read_bytes(), original_global)
        self.assertEqual(
            json.loads(workspace_path.read_text())["mcpServers"]["fixture"][
                "oauth"
            ]["clientId"],
            "workspace",
        )

    def test_unknown_server_and_locked_file_are_not_created_or_overwritten(
        self,
    ):
        with self.assertRaises(ValueError):
            self.settings.read_oauth("missing", self.cwd)
        view = self.settings.read_oauth("fixture", self.cwd)
        lock = self.path.with_name(self.path.name + ".companion-lock")
        lock.write_text("owner")
        with self.assertRaises(StorageConflict):
            self.settings.write_oauth(
                "fixture", self.cwd, {"client_id": "new"}, view["revision"]
            )
        self.assertEqual(lock.read_text(), "owner")

    def test_linked_owner_is_not_read_or_written(self):
        with patch("mcp_settings.Path.is_symlink", return_value=True):
            with self.assertRaises(PermissionError):
                self.settings.read_oauth("fixture", self.cwd)

    def test_new_workspace_owner_invalidates_global_revision(self):
        view = self.settings.read_oauth("fixture", self.cwd)
        workspace_path = self.cwd / ".agents" / "mcp_config.json"
        workspace_path.parent.mkdir()
        workspace_path.write_bytes(self.path.read_bytes())
        before = self.path.read_bytes()
        with self.assertRaises(StorageConflict):
            self.settings.write_oauth(
                "fixture", self.cwd, {"client_id": "new"}, view["revision"]
            )
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(workspace_path.read_bytes(), before)

    def test_bad_oauth_patch_preserves_bytes(self):
        before = self.path.read_bytes()
        view = self.settings.read_oauth("fixture", self.cwd)
        for payload in (
            {"env": {"SECRET": "bad"}},
            {"client_id": "bad\nvalue"},
            {"client_secret": "new", "clear_client_secret": True},
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    self.settings.write_oauth(
                        "fixture", self.cwd, payload, view["revision"]
                    )
                self.assertEqual(self.path.read_bytes(), before)


class MCPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.cwd = self.root / "project"
        self.home.mkdir()
        self.cwd.mkdir()
        self.probe = MCPProbe(self.home, timeout=1)
        self.runner = None
        self.messages = []

    async def asyncTearDown(self):
        if self.runner:
            await self.runner.cleanup()
        self.temp.cleanup()

    def config(self, entries, workspace=False):
        location = (
            (self.cwd / ".agents")
            if workspace
            else (self.home / ".gemini" / "config")
        )
        location.mkdir(parents=True, exist_ok=True)
        (location / "mcp_config.json").write_text(
            json.dumps({"mcpServers": entries}), encoding="utf-8-sig"
        )

    async def http(self, mode="success"):
        async def handler(request):
            if mode == "auth":
                return web.Response(status=401, text="private secret")
            if mode == "redirect":
                raise web.HTTPFound("http://127.0.0.1:1/secret")
            if request.method == "DELETE":
                return web.Response(status=204)
            message = await request.json()
            if mode == "slow":
                await asyncio.sleep(2)
            self.messages.append(message)
            if "id" not in message:
                return web.Response(status=202)
            method = message["method"]
            if method == "initialize":
                result = {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "secret", "version": "1"},
                }
            else:
                result = {"tools": [{"name": "example", "inputSchema": {}}]}
            response = {
                "jsonrpc": "2.0",
                "id": message["id"],
                "result": result,
            }
            if mode in ("wrong_id", "boolean_id"):
                response["id"] = True if mode == "boolean_id" else 999
            if mode == "malformed_tools" and method == "tools/list":
                response["result"]["tools"] = [{"name": "bad"}]
            if mode == "wrong_version" and method == "initialize":
                response["result"]["protocolVersion"] = "made-up"
            if mode == "large":
                return web.Response(
                    body=b"x" * (1024 * 1024 + 1),
                    content_type="application/json",
                )
            if mode in ("sse", "sse_crlf", "sse_open"):
                separator = "\r\n" if mode == "sse_crlf" else "\n"
                payload = (
                    "event: message"
                    + separator
                    + "data: "
                    + json.dumps(response)
                    + separator * 2
                )
                if mode == "sse_open":
                    stream = web.StreamResponse(
                        headers={"Content-Type": "text/event-stream"}
                    )
                    await stream.prepare(request)
                    await stream.write(payload.encode())
                    await asyncio.sleep(2)
                    return stream
                return web.Response(
                    text=payload, content_type="text/event-stream"
                )
            return web.json_response(
                response, headers={"Mcp-Session-Id": "fixture"}
            )

        app = web.Application()
        app.router.add_route("*", "/mcp", handler)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        self.config({"fixture": {"serverUrl": f"http://127.0.0.1:{port}/mcp"}})

    async def test_http_real_lifecycle(self):
        await self.http()
        result = await self.probe.test("fixture", self.cwd)
        self.assertEqual(result["status"], "connected")
        self.assertEqual(result["tool_count"], 1)
        self.assertEqual(
            [m["method"] for m in self.messages],
            ["initialize", "notifications/initialized", "tools/list"],
        )
        self.assertNotIn("secret", json.dumps(result))
        self.assertFalse(result["cli_connection_verified"])

    async def test_http_sse(self):
        await self.http("sse")
        self.assertEqual(
            (await self.probe.test("fixture", self.cwd))["status"], "connected"
        )

    async def test_sse_crlf_and_open_stream_deliver_result(self):
        for mode in ("sse_crlf", "sse_open"):
            with self.subTest(mode=mode):
                if self.runner:
                    await self.runner.cleanup()
                await self.http(mode)
                result = await self.probe.test("fixture", self.cwd)
                self.assertEqual(result["status"], "connected")

    async def test_oversized_response_is_rejected(self):
        await self.http("large")
        self.assertEqual(
            (await self.probe.test("fixture", self.cwd))["status"], "failed"
        )

    async def test_auth_required_is_not_connected_or_raw_diagnostics(self):
        await self.http("auth")
        result = await self.probe.test("fixture", self.cwd)
        self.assertEqual(result["status"], "auth_required")
        self.assertNotIn("secret", json.dumps(result))

    async def test_redirect_not_followed(self):
        await self.http("redirect")
        self.assertEqual(
            (await self.probe.test("fixture", self.cwd))["status"], "failed"
        )

    async def test_wrong_response_id_rejected(self):
        await self.http("wrong_id")
        self.assertEqual(
            (await self.probe.test("fixture", self.cwd))["status"], "failed"
        )

    async def test_boolean_ids_and_invalid_tool_definitions_rejected(self):
        for mode in ("boolean_id", "malformed_tools"):
            with self.subTest(mode=mode):
                if self.runner:
                    await self.runner.cleanup()
                await self.http(mode)
                self.assertEqual(
                    (await self.probe.test("fixture", self.cwd))["status"],
                    "failed",
                )

    async def test_unknown_protocol_rejected(self):
        await self.http("wrong_version")
        self.assertEqual(
            (await self.probe.test("fixture", self.cwd))["status"], "failed"
        )

    async def test_timeout_is_explicit(self):
        await self.http("slow")
        self.assertEqual(
            (await self.probe.test("fixture", self.cwd))["status"], "timeout"
        )

    async def test_disabled_missing_and_config_validation(self):
        self.config(
            {
                "disabled": {"disabled": True},
                "unsafe": {"serverUrl": "file:///private"},
            }
        )
        self.assertEqual(
            (await self.probe.test("disabled", self.cwd))["status"], "disabled"
        )
        self.assertEqual(
            (await self.probe.test("missing", self.cwd))["status"],
            "not_configured",
        )
        self.assertEqual(
            (await self.probe.test("unsafe", self.cwd))["status"], "failed"
        )
        with self.assertRaises(ValueError):
            await self.probe.test("../private", self.cwd)

    async def test_workspace_override_and_no_credential_echo(self):
        self.config(
            {
                "fixture": {
                    "serverUrl": "https://invalid.example",
                    "headers": {"Authorization": "secret"},
                }
            }
        )
        self.config({"fixture": {"disabled": True}}, workspace=True)
        result = await self.probe.test("fixture", self.cwd)
        self.assertEqual(result["status"], "disabled")
        self.assertNotIn("secret", json.dumps(result))

    async def test_stdio_timeout_and_cancel_terminate_owned_process(self):
        fixture = self.root / "stall.py"
        fixture.write_text("import time\ntime.sleep(60)\n")
        self.config(
            {"fixture": {"command": sys.executable, "args": [str(fixture)]}}
        )
        original_spawn = asyncio.create_subprocess_exec
        for cancel in (False, True):
            with self.subTest(cancel=cancel):
                started = asyncio.Event()
                owned = []

                async def capture(command, *args, **kwargs):
                    process = await original_spawn(command, *args, **kwargs)
                    if command == sys.executable:
                        owned.append(process)
                        started.set()
                    return process

                with patch(
                    "mcp_probe.asyncio.create_subprocess_exec",
                    side_effect=capture,
                ):
                    task = asyncio.create_task(
                        self.probe.test("fixture", self.cwd)
                    )
                    await asyncio.wait_for(started.wait(), 5)
                    if cancel:
                        task.cancel()
                        with self.assertRaises(asyncio.CancelledError):
                            await task
                    else:
                        self.assertEqual((await task)["status"], "timeout")
                    self.assertIsNotNone(owned[0].returncode)

    async def test_stdio_real_process_lifecycle(self):
        fixture = self.root / "mcp_fixture.py"
        fixture.write_text(
            "import sys,json\n"
            "for line in sys.stdin:\n"
            " m=json.loads(line)\n"
            " if 'id' not in m: continue\n"
            " r=({'protocolVersion':'2025-06-18',"
            "'capabilities':{'tools':{}}} if "
            "m['method']=='initialize' else {'tools':[]})\n"
            " print(json.dumps({'jsonrpc':'2.0',"
            "'id':m['id'],'result':r}),flush=True)\n"
        )
        self.config(
            {"fixture": {"command": sys.executable, "args": [str(fixture)]}}
        )
        result = await self.probe.test("fixture", self.cwd)
        self.assertEqual(result["status"], "connected")
        self.assertEqual(result["tool_count"], 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.TestSuite(
            [
                unittest.defaultTestLoader.loadTestsFromTestCase(case)
                for case in (NativeAuthTests, OAuthSettingsTests, MCPTests)
            ]
        )
    )
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
