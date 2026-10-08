"""Paired loopback checks for restored routes without live accounts."""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from aiohttp import ClientSession, CookieJar, web

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from application import create_app  # noqa: E402


class FeatureTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.home = Path(self.folder.name)
        with patch.object(Path, "home", return_value=self.home):
            self.app = create_app(self.home / "data", 0)
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        self.app["port"] = self.port
        self.url = f"http://127.0.0.1:{self.port}/api/v1"
        self.client = ClientSession(cookie_jar=CookieJar(unsafe=True))
        async with self.client.post(
            self.url + "/pair", json={"code": self.app["pairing"].code}
        ) as response:
            self.headers = {
                "X-CSRF-Token": (await response.json())["csrf_token"]
            }

    async def asyncTearDown(self):
        await self.client.close()
        await self.runner.cleanup()
        self.folder.cleanup()

    async def test_local_task_queue_requires_csrf_and_is_cancelable(self):
        self.app["cli_admin"].update_reserved = True
        session = self.app["sessions"].create({"cwd": str(self.home)})
        payload = {
            "mode": "queued",
            "session_id": session["session_id"],
            "message": "next turn",
            "request_id": "queued-http",
        }
        async with self.client.post(
            self.url + "/local-tasks", json=payload
        ) as response:
            self.assertEqual(response.status, 403)
        async with self.client.post(
            self.url + "/local-tasks", headers=self.headers, json=payload
        ) as response:
            self.assertEqual(response.status, 202)
            entry = await response.json()
        async with self.client.post(
            self.url + "/local-tasks", headers=self.headers, json=payload
        ) as response:
            self.assertEqual(
                (await response.json())["task_id"], entry["task_id"]
            )
        async with self.client.post(
            self.url + "/local-tasks/" + entry["task_id"] + "/cancel",
            headers=self.headers,
            json={},
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual((await response.json())["state"], "cancelled")
        async with self.client.get(self.url + "/local-tasks") as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(len((await response.json())["tasks"]), 1)

    async def test_local_schedule_rejects_naive_time_and_hides_ledger(self):
        session = self.app["sessions"].create({"cwd": str(self.home)})
        payload = {
            "mode": "scheduled",
            "session_id": session["session_id"],
            "message": "scheduled",
            "request_id": "naive-http",
            "scheduled_at": "2030-01-01T10:00:00",
            "missed_policy": "skip",
        }
        async with self.client.post(
            self.url + "/local-tasks", headers=self.headers, json=payload
        ) as response:
            self.assertEqual(response.status, 400)
        ledger = self.app["store"].root / "local-tasks.json"
        self.app["store"].write("settings", {"cwd": str(self.home)})
        async with self.client.get(
            self.url + "/file", params={"path": str(ledger)}
        ) as response:
            self.assertEqual(response.status, 403)

    async def test_direct_turn_cannot_overtake_saved_queue(self):
        self.app["cli_admin"].update_reserved = True
        session = self.app["sessions"].create({"cwd": str(self.home)})
        entry = self.app["local_tasks"].create(
            {
                "mode": "queued",
                "session_id": session["session_id"],
                "message": "first",
                "request_id": "saved-first",
            }
        )
        self.app["cli_admin"].update_reserved = False
        async with self.client.post(
            self.url + "/sessions/" + session["session_id"] + "/runs",
            headers=self.headers,
            json={"message": "second", "client_request_id": "direct-second"},
        ) as response:
            self.assertEqual(response.status, 409)
        self.assertFalse(self.app["sessions"].runs)
        self.assertEqual(
            self.app["local_tasks"].detail(entry["task_id"])["state"],
            "pending",
        )

    async def test_owned_task_inventory_is_real_and_empty_on_new_server(self):
        async with self.client.get(self.url + "/tasks") as response:
            self.assertEqual(response.status, 200)
            document = await response.json()
            self.assertEqual(document["tasks"], [])
            self.assertEqual(document["subagents"], [])

    async def test_visibility_requires_csrf_and_rejects_invalid_values(self):
        async with self.client.post(
            self.url + "/client/visibility", json={"visible": True}
        ) as response:
            self.assertEqual(response.status, 403)
        async with self.client.post(
            self.url + "/client/visibility",
            headers=self.headers,
            json={"visible": True},
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertTrue((await response.json())["visible"])
        async with self.client.post(
            self.url + "/client/visibility",
            headers=self.headers,
            json={"visible": "true"},
        ) as response:
            self.assertEqual(response.status, 400)

    async def test_native_auth_handoff_never_claims_authenticated(self):
        async with self.client.post(
            self.url + "/auth/login", headers=self.headers, json={}
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertIsNone((await response.json())["authenticated"])

    async def test_oauth_http_preserves_secret_and_requires_csrf(self):
        config = self.home / ".gemini" / "config" / "mcp_config.json"
        config.parent.mkdir(parents=True)
        config.write_text(
            json.dumps(
                {
                    "unknown": 42,
                    "mcpServers": {
                        "server": {
                            "serverUrl": "https://example.invalid/mcp",
                            "oauth": {
                                "clientId": "old-client",
                                "clientSecret": "saved-private",
                            },
                            "headers": {"Authorization": "private-header"},
                        }
                    },
                }
            )
        )
        async with self.client.get(self.url + "/mcp/server/oauth") as response:
            self.assertEqual(response.status, 200)
            view = await response.json()
            self.assertNotIn("saved-private", json.dumps(view))
            self.assertNotIn("private-header", json.dumps(view))
        payload = {
            "revision": view["revision"],
            "oauth": {"client_id": "new-client", "client_secret": ""},
        }
        async with self.client.patch(
            self.url + "/mcp/server/oauth", json=payload
        ) as response:
            self.assertEqual(response.status, 403)
        async with self.client.patch(
            self.url + "/mcp/server/oauth", headers=self.headers, json=payload
        ) as response:
            self.assertEqual(response.status, 200)
        saved = json.loads(config.read_text())
        self.assertEqual(saved["unknown"], 42)
        self.assertEqual(
            saved["mcpServers"]["server"]["oauth"]["clientSecret"],
            "saved-private",
        )
        self.assertEqual(
            saved["mcpServers"]["server"]["oauth"]["clientId"], "new-client"
        )

    async def test_workspace_mcp_staging_file_is_also_private(self):
        workspace = self.home / "work"
        staged = workspace / ".agents" / ".companion-oauth-interrupted"
        staged.parent.mkdir(parents=True)
        staged.write_text("private client secret")
        self.app["store"].write("settings", {"cwd": str(workspace)})
        async with self.client.get(
            self.url + "/file", params={"path": str(staged)}
        ) as response:
            self.assertEqual(response.status, 403)
            self.assertNotIn("private client secret", await response.text())

    async def test_workspace_mcp_config_is_hidden_from_file_api(self):
        workspace = self.home / "work"
        config = workspace / ".agents" / "mcp_config.json"
        config.parent.mkdir(parents=True)
        config.write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "server": {"headers": {"Authorization": "private"}}
                    }
                }
            )
        )
        self.app["store"].write("settings", {"cwd": str(workspace)})
        async with self.client.get(
            self.url + "/file", params={"path": str(config)}
        ) as response:
            self.assertEqual(response.status, 403)
            self.assertNotIn("private", await response.text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
