"""Focused backend acceptance checks; external CLI only is substituted."""

import asyncio
import json
import hashlib
import hmac
import os
import signal
from pathlib import Path
import sys
import tempfile
import time
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from legacy_conversations import LegacyConversations  # noqa: E402
from sessions import Sessions, RunConflict, EventLog  # noqa: E402
from cli_client import (  # noqa: E402
    CLI,
    CLIUnavailable,
    parse_listing,
    terminate_process,
)  # noqa: E402
from android_client import AndroidClient  # noqa: E402
from storage import AtomicStore, StorageConflict, WorkspacePaths  # noqa: E402
from security import Pairing  # noqa: E402
from application import create_app  # noqa: E402
from aiohttp import ClientSession, CookieJar, WSMsgType, web  # noqa: E402
from cli_catalog import local_catalog  # noqa: E402
from runtime_status import CLIAdministration, parse_quota_report  # noqa: E402


class EventRecoveryTests(unittest.TestCase):
    def test_unterminated_tail_preserves_original_and_resumes_event_ids(self):
        first = {"id": 1, "event": "state", "data": {"state": "running"}}
        second = {"id": 2, "event": "delta", "data": {"text_delta": "x"}}
        for tail, retained in (
            (b'{"id":2,"event":"delta","data":{"text_delta":"\xd8', 1),
            (json.dumps(second).encode(), 2),
        ):
            with (
                self.subTest(retained=retained),
                tempfile.TemporaryDirectory() as folder,
            ):
                root = Path(folder)
                original = json.dumps(first).encode() + b"\n" + tail
                (root / "torn.ndjson").write_bytes(original)
                recovered = EventLog(root, "torn")
                self.assertEqual(recovered.sequence, retained)
                backups = list(root.glob("torn.ndjson.interrupted-*"))
                self.assertEqual(len(backups), 1)
                self.assertEqual(backups[0].read_bytes(), original)
                recovered.append("result", {"state": "interrupted"})
                reloaded = EventLog(root, "torn")
                self.assertEqual(reloaded.sequence, retained + 1)
                self.assertEqual(
                    reloaded.events[-1]["data"]["state"], "interrupted"
                )

    def test_complete_corrupt_record_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            original = b'{"id":1,"event":"state","data":{}}\ninvalid\n'
            (root / "corrupt.ndjson").write_bytes(original)
            with self.assertRaises(json.JSONDecodeError):
                EventLog(root, "corrupt")
            self.assertEqual((root / "corrupt.ndjson").read_bytes(), original)
            self.assertEqual(list(root.glob("*.interrupted-*")), [])


class StorageTests(unittest.TestCase):
    def test_session_transaction_recovers_interrupted_pair_without_loss(self):
        for failed_document in ("sessions", "runs"):
            with self.subTest(document=failed_document):
                with tempfile.TemporaryDirectory() as folder:
                    store = AtomicStore(Path(folder))
                    store.write("sessions", {"sessions": {}, "future": 7})
                    store.write("runs", {"runs": {}, "future": 9})
                    sessions = Sessions(store, SimpleNamespace())
                    session = sessions.create({"cwd": folder})
                    original_write = store.write

                    def interrupted_write(name, document):
                        if name == failed_document:
                            raise OSError("Simulated interrupted persistence")
                        original_write(name, document)

                    with patch.object(store, "write", interrupted_write):
                        with self.assertRaises(OSError):
                            sessions.start(
                                session["session_id"],
                                {
                                    "message": "Preserve this turn",
                                    "client_request_id": "interrupted-start",
                                },
                            )
                    recovered = Sessions(store, SimpleNamespace())
                    detail = recovered.detail(session["session_id"])
                    self.assertEqual(len(detail["runs"]), 1)
                    self.assertEqual(detail["runs"][0]["state"], "interrupted")
                    self.assertEqual(
                        detail["runs"][0]["message"], "Preserve this turn"
                    )
                    self.assertEqual(store.read("sessions")["future"], 7)
                    self.assertEqual(store.read("runs")["future"], 9)
                    self.assertFalse(
                        store.path("session-transaction").exists()
                    )

    def test_legacy_missing_run_remains_visible_as_interrupted(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AtomicStore(Path(folder))
            store.write(
                "sessions",
                {
                    "sessions": {
                        "s": {
                            "session_id": "s",
                            "conversation_id": "saved-conversation",
                            "runs": ["missing"],
                            "cwd": folder,
                        }
                    }
                },
            )
            store.write("runs", {"runs": {}})
            recovered = Sessions(store, SimpleNamespace())
            detail = recovered.detail("s")
            self.assertEqual(detail["conversation_id"], "saved-conversation")
            self.assertEqual(detail["runs"][0]["run_id"], "missing")
            self.assertEqual(detail["runs"][0]["state"], "interrupted")
            self.assertTrue(detail["runs"][0]["error"])

    def test_failed_final_save_does_not_claim_durable_completion(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AtomicStore(Path(folder))
            sessions = Sessions(store, SimpleNamespace())
            session = sessions.create({"cwd": folder})
            run = {
                "run_id": "final-save",
                "session_id": session["session_id"],
                "state": "running",
                "message": "Question",
                "response": "Answer",
                "client_request_id": "final-save",
                "fingerprint": "fixture",
                "created_at": 0,
                "usage": {},
            }
            sessions.runs[run["run_id"]] = run
            session["runs"].append(run["run_id"])
            sessions.persist()
            sessions.emit(run, "state")
            with patch.object(
                store, "write", side_effect=OSError("Disk full")
            ):
                with self.assertRaises(OSError):
                    sessions.finish(session, run, "completed")
            self.assertEqual(run["state"], "interrupted")
            self.assertEqual(run["response"], "Answer")
            self.assertTrue(run["error"])
            self.assertTrue(sessions.logs[run["run_id"]].changed.is_set())

    def test_error_stream_failure_still_saves_terminal_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AtomicStore(Path(folder))
            sessions = Sessions(store, SimpleNamespace())
            session = sessions.create({"cwd": folder})
            run = {
                "run_id": "failed-stream",
                "session_id": session["session_id"],
                "state": "running",
                "message": "Question",
                "response": "Partial",
                "client_request_id": "failed-stream",
                "fingerprint": "fixture",
                "created_at": 0,
                "usage": {},
            }
            sessions.runs[run["run_id"]] = run
            session["runs"].append(run["run_id"])
            sessions.persist()
            with patch.object(
                sessions, "emit", side_effect=OSError("Disk full")
            ):
                with self.assertRaises(OSError):
                    sessions.finish(session, run, "failed", "CLI unavailable")
            snapshot = store.read("runs")["runs"][run["run_id"]]
            self.assertEqual(snapshot["state"], "failed")
            self.assertEqual(snapshot["response"], "Partial")
            self.assertEqual(snapshot["error"], "CLI unavailable")

    def test_revision_preserves_unknown_and_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AtomicStore(Path(folder))
            store.write(
                "settings", {"unknown": 7, "model": "old", "revision": 0}
            )
            revision = store.read("settings")["revision"]
            store.update("settings", {"model": "new"}, revision)
            self.assertEqual(store.read("settings")["unknown"], 7)
            with self.assertRaises(StorageConflict):
                store.update("settings", {"model": "bad"}, revision)
            self.assertTrue((Path(folder) / "settings.json.bak").exists())

    def test_corrupt_primary_recovers_without_poisoning_good_backup(self):
        with tempfile.TemporaryDirectory() as folder:
            store = AtomicStore(Path(folder))
            store.write("settings", {"revision": 0, "model": "good"})
            store.write("settings", {"revision": 1, "model": "new"})
            store.path("settings").write_text("broken", encoding="utf-8")
            recovered = store.read("settings")
            self.assertEqual(recovered["model"], "good")
            store.update("settings", {"model": "recovered"}, 0)
            backup = Path(str(store.path("settings")) + ".bak")
            self.assertEqual(json.loads(backup.read_text())["model"], "good")

    def test_workspace_rejects_escape(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = WorkspacePaths([Path(folder)])
            with self.assertRaises(PermissionError):
                paths.resolve(str(Path(folder).parent))

    def test_pairing_attempt_limit_and_csrf(self):
        pairing = Pairing()
        for _ in range(5):
            self.assertIsNone(pairing.pair("invalid"))
        self.assertIsNone(pairing.pair(pairing.code))
        pairing = Pairing()
        session = pairing.pair(pairing.code)
        self.assertIsNotNone(session)
        self.assertTrue(pairing.authorized(session[0]))
        self.assertFalse(pairing.valid_csrf(session[0], "wrong"))


class HTTPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        with patch.object(Path, "home", return_value=Path(self.folder.name)):
            self.app = create_app(Path(self.folder.name), 0)
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        self.app["port"] = self.port
        self.client = ClientSession(cookie_jar=CookieJar(unsafe=True))
        self.url = f"http://127.0.0.1:{self.port}"

    async def asyncTearDown(self):
        await self.client.close()
        await self.runner.cleanup()
        self.folder.cleanup()

    async def authenticated(self):
        async with self.client.post(
            self.url + "/api/v1/pair", json={"code": self.app["pairing"].code}
        ) as response:
            csrf = (await response.json())["csrf_token"]
        return {"X-CSRF-Token": csrf}

    async def test_csrf_grace_period_accepts_recently_active_token_during_cookie_rotation(self):
        headers = await self.authenticated()
        csrf_1 = headers["X-CSRF-Token"]

        # Simulate native Android bootstrap rotating the cookie
        cookie_2, _ = self.app["pairing"].new_session()
        self.client.cookie_jar.update_cookies({"agy_session": cookie_2})

        sessions = self.app["sessions"]
        session = sessions.create({"cwd": self.folder.name})
        endpoint = self.url + "/api/v1/sessions/" + session["session_id"] + "/runs"
        async with self.client.post(
            endpoint,
            json={"message": "Grace test", "client_request_id": "grace-1"},
            headers={"X-CSRF-Token": csrf_1},
        ) as reply:
            self.assertNotEqual(reply.status, 403)

    async def test_commands_capability_matches_available_catalog_route(self):
        await self.authenticated()
        self.app["cli"].executable = sys.executable
        self.app["cli"].catalog_actions = AsyncMock(return_value=[])
        self.app["cli"].listing = AsyncMock(
            return_value=[
                {"id": "command-one", "name": "Command one"},
            ]
        )
        async with self.client.get(self.url + "/api/v1/capabilities") as reply:
            capabilities = (await reply.json())["capabilities"]
        commands = next(
            (entry for entry in capabilities if entry["id"] == "commands"),
            None,
        )
        self.assertIsNotNone(commands)
        self.assertTrue(commands["available"])
        async with self.client.get(self.url + "/api/v1/commands") as reply:
            self.assertEqual(
                (await reply.json())["commands"][0]["id"], "command-one"
            )

    async def test_failed_start_retry_reports_interrupted_without_execution(
        self,
    ):
        headers = await self.authenticated()
        sessions = self.app["sessions"]
        session = sessions.create({"cwd": self.folder.name})
        store = self.app["store"]
        original_write = store.write

        def interrupted_write(name, document):
            if name == "runs":
                raise OSError("Simulated unavailable storage")
            original_write(name, document)

        endpoint = (
            self.url + "/api/v1/sessions/" + session["session_id"] + "/runs"
        )
        payload = {
            "message": "Not executed",
            "client_request_id": "failed-start",
        }
        with patch.object(store, "write", interrupted_write):
            async with self.client.post(
                endpoint, json=payload, headers=headers
            ) as reply:
                self.assertEqual(reply.status, 503)
        async with self.client.post(
            endpoint, json=payload, headers=headers
        ) as reply:
            run_id = (await reply.json())["run_id"]
        self.assertEqual(sessions.runs[run_id]["state"], "interrupted")
        self.assertNotIn(run_id, sessions.tasks)
        self.assertFalse(sessions.processes)
        self.assertFalse(
            Path(str(store.path("session-transaction")) + ".bak").exists()
        )
        async with self.client.get(
            self.url + "/api/v1/runs/" + run_id + "/events"
        ) as reply:
            events = await asyncio.wait_for(reply.text(), 2)
            self.assertIn("event: result", events)
            self.assertIn("interrupted", events)

    async def test_http_turn_sse_and_durable_request_identity(self):
        headers = await self.authenticated()

        async def spawn_fixture(arguments, cwd):
            options = (
                {"start_new_session": True} if sys.platform != "win32" else {}
            )
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",
                "-c",
                FIXTURE,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                **options,
            )
            if sys.platform != "win32":
                proc._companion_pgid = proc.pid
            return proc

        self.app["cli"].spawn = AsyncMock(side_effect=spawn_fixture)
        self.app["store"].update(
            "settings", {"workspace_roots": [self.folder.name]}, 0
        )
        async with self.client.post(
            self.url + "/api/v1/sessions",
            json={"cwd": self.folder.name, "model": "fixture"},
            headers=headers,
        ) as response:
            self.assertEqual(response.status, 201)
            session_id = (await response.json())["session_id"]
        endpoint = self.url + "/api/v1/sessions/" + session_id + "/runs"
        request = {"message": "HTTP", "client_request_id": "http-turn"}
        async with self.client.post(
            endpoint, json=request, headers=headers
        ) as response:
            self.assertEqual(response.status, 202)
            run_id = (await response.json())["run_id"]
        async with self.client.get(
            self.url + "/api/v1/runs/" + run_id + "/events"
        ) as response:
            stream = await asyncio.wait_for(response.text(), 5)
            self.assertIn("event: delta", stream)
            self.assertIn("event: result", stream)
            self.assertIn("fixture-conversation", stream)
        async with self.client.post(
            endpoint, json=request, headers=headers
        ) as response:
            self.assertEqual((await response.json())["run_id"], run_id)
        async with self.client.get(
            self.url + "/api/v1/runs/" + run_id
        ) as response:
            snapshot = await response.json()
            self.assertEqual(snapshot["state"], "completed")
            self.assertEqual(snapshot["response"], "Answer HTTP")
            self.assertGreater(snapshot["last_event_id"], 1)
        async with self.client.get(
            self.url + "/api/v1/runs/" + run_id + "/events?after=-1"
        ) as response:
            self.assertEqual(response.status, 400)

    async def test_cli_owned_changes_are_rejected_without_mutating_settings(
        self,
    ):
        headers = await self.authenticated()
        initial = self.app["store"].read("settings")
        headers["If-Match"] = str(initial["revision"])
        for key in (
            "permissions",
            "allow_commands",
            "allowNonWorkspaceAccess",
            "allow_write",
            "allow_web",
            "allow_subagent",
            "allow_schedule",
            "safe_mode",
            "autopilot",
            "disabledSkills",
            "disabledPlugins",
            "mcpServers",
        ):
            with self.subTest(key=key):
                async with self.client.patch(
                    self.url + "/api/v1/settings",
                    json={key: {"changed": True}},
                    headers=headers,
                ) as response:
                    self.assertEqual(response.status, 400)
                    self.assertEqual(
                        (await response.json())["code"], "cli_owned_settings"
                    )
                self.assertEqual(self.app["store"].read("settings"), initial)

    async def test_cli_settings_endpoints_read_and_write(self):
        headers = await self.authenticated()
        async with self.client.get(
            self.url + "/api/v1/cli/settings", headers=headers
        ) as response:
            self.assertEqual(response.status, 200)
            data = await response.json()
            self.assertIn("model", data)
            self.assertIn("effort", data)
            self.assertIn("safe_mode", data)
            self.assertIn("revision", data)

        revision = data["revision"]
        patch = {
            "model": "gemini-3.8-flash-low",
            "autopilot": True,
            "allow_commands": True,
            "allow_write": True,
            "allow_web": True,
            "trustedWorkspaces": ["/data/data/com.termux/files/home"],
            "tones_enabled": True,
            "haptic_enabled": False,
            "speech_enabled": True,
        }
        async with self.client.patch(
            self.url + "/api/v1/cli/settings",
            json={"settings": patch, "revision": revision},
            headers=headers,
        ) as response:
            self.assertEqual(response.status, 200)
            updated = await response.json()
            self.assertEqual(updated["model"], "gemini-3.8-flash-low")
            self.assertEqual(updated["effort"], "low")
            self.assertTrue(updated["autopilot"])
            self.assertFalse(updated["safe_mode"])
            self.assertTrue(updated["allow_write"])
            self.assertTrue(updated["allow_web"])
            self.assertIn("write_file(*)", updated["whitelist"])
            self.assertIn("read_url(*)", updated["whitelist"])
            self.assertEqual(updated["trustedWorkspaces"], ["/data/data/com.termux/files/home"])

    async def test_v1_routing_errors_keep_legacy_upgrade_separate(self):
        headers = await self.authenticated()
        for method, route, status in (
            ("GET", "/api/v1/unknown", 404),
            ("POST", "/api/v1/settings", 405),
            ("POST", "/api/ai/chat", 426),
        ):
            with self.subTest(route=route):
                async with self.client.request(
                    method, self.url + route, headers=headers
                ) as response:
                    self.assertEqual(response.status, status)
                    payload = await response.json()
                    for field in ("code", "message", "request_id"):
                        self.assertIn(field, payload)

    async def test_settings_hide_secrets_and_preserve_nested_unknown_fields(
        self,
    ):
        self.app["store"].write(
            "settings",
            {
                "revision": 0,
                "api_key": "private",
                "nested": {"known": 1, "unknown": 9, "token": "private"},
            },
        )
        headers = await self.authenticated()
        async with self.client.get(self.url + "/api/v1/settings") as response:
            shown = (await response.json())["settings"]
            self.assertNotIn("api_key", shown)
            self.assertNotIn("token", shown["nested"])
        headers["If-Match"] = "0"
        async with self.client.patch(
            self.url + "/api/v1/settings",
            json={"settings": {"nested": {"known": 2}}},
            headers=headers,
        ) as response:
            self.assertEqual(response.status, 200)
        persisted = self.app["store"].read("settings")
        self.assertEqual(persisted["nested"]["unknown"], 9)
        self.assertEqual(persisted["nested"]["token"], "private")
        self.assertEqual(persisted["api_key"], "private")
        async with self.client.patch(
            self.url + "/api/v1/settings", json={}, headers=headers
        ) as response:
            self.assertEqual(response.status, 409)

    async def test_legacy_owner_read_only_and_explicit_resume(self):
        legacy = self.app["legacy"]
        directory = (
            legacy.root / "legacy-conversation" / ".system_generated" / "logs"
        )
        directory.mkdir(parents=True)
        transcript = directory / "transcript.jsonl"
        original = (
            b"\xef\xbb\xbf"
            + json.dumps(
                {
                    "type": "USER_INPUT",
                    "content": "First request",
                    "unknown": 9,
                }
            ).encode()
            + b"\nmalformed record\n"
            + json.dumps(
                {"type": "FUTURE_RECORD", "future": {"retained": True}}
            ).encode()
            + b"\n"
        )
        transcript.write_bytes(original)
        async with self.client.get(
            self.url + "/api/v1/legacy/conversations"
        ) as response:
            self.assertEqual(response.status, 401)
        headers = await self.authenticated()
        async with self.client.get(
            self.url + "/api/v1/legacy/conversations"
        ) as response:
            listing = (await response.json())["conversations"]
            self.assertEqual(
                listing[0]["conversation_id"], "legacy-conversation"
            )
        async with self.client.get(
            self.url + "/api/v1/legacy/conversations/legacy-conversation"
        ) as response:
            recovered = await response.json()
            self.assertEqual(recovered["invalid_records"], 1)
            self.assertEqual(recovered["records"][0]["unknown"], 9)
            self.assertEqual(
                recovered["records"][1]["future"], {"retained": True}
            )
        self.assertEqual(transcript.read_bytes(), original)
        self.app["store"].update(
            "settings", {"workspace_roots": [self.folder.name]}, 0
        )
        async with self.client.post(
            self.url + "/api/v1/sessions",
            json={
                "cwd": self.folder.name,
                "conversation_id": "legacy-conversation",
            },
            headers=headers,
        ) as response:
            self.assertEqual(response.status, 201)
            session = await response.json()
            self.assertEqual(session["conversation_id"], "legacy-conversation")
            self.assertEqual(session["runs"], [])
        self.assertEqual(self.app["sessions"].processes, {})
        with self.assertRaises(ValueError):
            legacy.transcript_path("../outside")
        async with self.client.post(
            self.url + "/api/v1/sessions",
            json={"cwd": self.folder.name, "conversation_id": "missing"},
            headers=headers,
        ) as response:
            self.assertEqual(response.status, 404)

    async def test_file_api_cannot_disclose_internal_private_configuration(
        self,
    ):
        headers = await self.authenticated()
        private = self.app["store"].path("android")
        self.app["store"].write(
            "android", {"android_token": "private" * 8, "android_port": 8765}
        )
        async with self.client.get(
            self.url + "/api/v1/file", params={"path": str(private)}
        ) as response:
            self.assertEqual(response.status, 403)
            self.assertNotIn("private", await response.text())
        async with self.client.get(
            self.url + "/api/v1/files", params={"path": str(private.parent)}
        ) as response:
            self.assertEqual(response.status, 403)
        async with self.client.post(
            self.url + "/api/v1/directories",
            json={"path": str(private.parent / "client-created")},
            headers=headers,
        ) as response:
            self.assertEqual(response.status, 403)

    async def test_custom_roots_do_not_override_private_path_and_listing_guard(
        self,
    ):
        headers = await self.authenticated()
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            self.app["legacy"].root = (
                home / ".gemini" / "antigravity-cli" / "brain"
            )
            for private_name in (".gemini", ".agy", ".config/agy"):
                private = home / private_name
                private.mkdir(parents=True)
                (private / "credential.json").write_text(
                    '{"token":"fixture-private"}', encoding="utf-8"
                )
            (home / "notes.txt").write_text("public fixture", encoding="utf-8")
            self.app["store"].update(
                "settings",
                {"workspace_roots": [str(home), self.folder.name]},
                0,
            )
            async with self.client.get(
                self.url + "/api/v1/files", params={"path": str(home)}
            ) as response:
                self.assertEqual(response.status, 200)
                names = {
                    entry["name"]
                    for entry in (await response.json())["entries"]
                }
                self.assertIn("notes.txt", names)
                self.assertIn(".gemini", names)
                self.assertNotIn(".agy", names)
            async with self.client.get(
                self.url + "/api/v1/files",
                params={"path": str(home / ".config")},
            ) as response:
                self.assertEqual((await response.json())["entries"], [])
            for private_name in (".gemini", ".agy", ".config/agy"):
                async with self.client.get(
                    self.url + "/api/v1/file",
                    params={
                        "path": str(home / private_name / "credential.json")
                    },
                ) as response:
                    self.assertEqual(response.status, 403)
            async with self.client.post(
                self.url + "/api/v1/sessions",
                json={"cwd": self.folder.name},
                headers=headers,
            ) as response:
                self.assertEqual(response.status, 201)

    async def test_available_storage_roots_and_dynamic_listing(self):
        headers = await self.authenticated()
        async with self.client.get(
            self.url + "/api/v1/files", headers=headers
        ) as response:
            self.assertEqual(response.status, 200)
            data = await response.json()
            self.assertIn("storages", data)
            self.assertTrue(isinstance(data["storages"], list))
            storage_names = [s["name"] for s in data["storages"]]
            self.assertIn("تيرماكس", storage_names)

    async def test_file_symlink_alias_cannot_expose_private_store(self):
        await self.authenticated()
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            private = self.app["store"].path("android")
            self.app["store"].write(
                "android",
                {"android_token": "private" * 8, "android_port": 8765},
            )
            alias = home / "ordinary.json"
            try:
                alias.symlink_to(private)
            except OSError:
                self.skipTest(
                    "The operating system does not allow test symlinks"
                )
            self.app["store"].update(
                "settings",
                {"workspace_roots": [str(home), self.folder.name]},
                0,
            )
            async with self.client.get(
                self.url + "/api/v1/file", params={"path": str(alias)}
            ) as response:
                self.assertEqual(response.status, 403)
            async with self.client.get(
                self.url + "/api/v1/files", params={"path": str(home)}
            ) as response:
                self.assertEqual((await response.json())["entries"], [])

    async def test_android_health_challenge_proves_published_secret(self):
        nonce = "ab" * 32
        token = "challenge-fixture-" + "x" * 40
        endpoint = self.url + "/health?android_nonce=" + nonce
        async with self.client.get(endpoint) as response:
            self.assertNotIn("android_proof", await response.json())
        self.app["store"].write(
            "android", {"android_token": token, "android_port": 8765}
        )
        async with self.client.get(endpoint) as response:
            self.assertEqual(response.status, 200)
            health = await response.json()
            expected = hmac.new(
                token.encode("utf-8"), nonce.encode("ascii"), hashlib.sha256
            ).hexdigest()
            self.assertEqual(health["android_proof"], expected)
            self.assertNotIn(token, json.dumps(health))
            self.assertNotIn("data_dir", health)
        async with self.client.get(self.url + "/health") as response:
            self.assertNotIn("android_proof", await response.json())
        for bad_nonce in ("short", "z" * 64, ""):
            async with self.client.get(
                self.url + "/health?android_nonce=" + bad_nonce
            ) as response:
                self.assertEqual(response.status, 400)

    async def test_external_atomic_token_publish_enables_existing_server(self):
        token = "external-fixture-" + "x" * 40
        self.assertFalse(self.app["android"].available)
        async with self.client.get(self.url + "/health") as response:
            before = await response.json()
        async with self.client.post(
            self.url + "/api/v1/android/bootstrap",
            headers={"Authorization": "Bearer " + token},
        ) as response:
            self.assertEqual(response.status, 401)
        external = AtomicStore(Path(self.folder.name))
        external.write(
            "android", {"android_token": token, "android_port": 8765}
        )
        async with self.client.post(
            self.url + "/api/v1/android/bootstrap",
            headers={"Authorization": "Bearer " + token},
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("HttpOnly", response.headers["Set-Cookie"])
            self.assertIn("csrf_token", await response.json())
        self.assertEqual(
            self.app["android"].configuration["android_token"], token
        )
        async with self.client.get(self.url + "/health") as response:
            after = await response.json()
        self.assertEqual(before["instance_id"], after["instance_id"])
        self.assertNotIn("data_dir", after)
        self.assertNotIn(token, json.dumps(after))
        async with self.client.post(
            self.url + "/api/v1/android/bootstrap",
            headers={"Authorization": "Bearer wrong"},
        ) as response:
            self.assertEqual(response.status, 401)

    async def test_bad_published_configuration_is_rejected_gracefully(self):
        for configuration in (
            {"android_token": 34, "android_port": 8765},
            {"android_token": "x" * 40, "android_port": "8765"},
            ["invalid object"],
        ):
            self.app["store"].write("android", configuration)
            async with self.client.post(
                self.url + "/api/v1/android/bootstrap",
                headers={"Authorization": "Bearer " + "x" * 40},
            ) as response:
                self.assertEqual(response.status, 401)
                self.assertEqual(
                    (await response.json())["code"], "unauthorized"
                )

    async def test_instance_identity_is_stable_for_data_directory(self):
        async with self.client.get(self.url + "/health") as response:
            first = (await response.json())["instance_id"]
        original = self.app["store"].read("instance")
        self.app["store"].write("instance", dict(original, unknown="retained"))
        with patch.object(Path, "home", return_value=Path(self.folder.name)):
            reopened = create_app(Path(self.folder.name), self.port)
        self.assertEqual(reopened["instance_id"], first)
        self.assertEqual(
            self.app["store"].read("instance")["unknown"], "retained"
        )
        await reopened["sessions"].close()

    async def test_native_bootstrap_and_static_isolation(self):
        token = "private-fixture-token-" + "x" * 32
        self.app["android"].configure(
            {"android_token": token, "android_port": 8765}
        )
        async with self.client.post(
            self.url + "/api/v1/android/bootstrap"
        ) as response:
            self.assertEqual(response.status, 401)
        async with self.client.post(
            self.url + "/api/v1/android/bootstrap",
            headers={"Authorization": "Bearer " + token},
        ) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("HttpOnly", response.headers["Set-Cookie"])
            self.assertIn("csrf_token", await response.json())
        async with self.client.get(
            self.url + "/api/v1/auth/session"
        ) as response:
            self.assertEqual(response.status, 200)
        for forbidden in (
            "/server.py",
            "/android.json",
            "/vendor/../../storage.py",
        ):
            async with self.client.get(self.url + forbidden) as response:
                self.assertEqual(response.status, 404)
        async with self.client.get(
            self.url + "/health",
            headers={"Origin": "https://attacker.example"},
        ) as response:
            self.assertEqual(response.status, 403)

    async def test_pairing_enforces_mutation_csrf_and_legacy_upgrade(self):
        async with self.client.get(self.url + "/health") as response:
            self.assertEqual((await response.json())["api_versions"], [1])
            self.assertIn("Content-Security-Policy", response.headers)
        async with self.client.get(self.url + "/api/v1/settings") as response:
            self.assertEqual(response.status, 401)
        async with self.client.post(
            self.url + "/api/v1/pair", json={"code": self.app["pairing"].code}
        ) as response:
            csrf = (await response.json())["csrf_token"]
        async with self.client.patch(
            self.url + "/api/v1/settings", json={"model": "test"}
        ) as response:
            self.assertEqual(response.status, 403)
        async with self.client.patch(
            self.url + "/api/v1/settings",
            json={"model": "test"},
            headers={"X-CSRF-Token": csrf, "If-Match": '"0"'},
        ) as response:
            self.assertEqual(response.status, 200)
        async with self.client.get(self.url + "/api/ai/chat") as response:
            self.assertEqual(response.status, 426)

    async def test_create_session_with_nonexistent_conversation_returns_404(self):
        async with self.client.post(
            self.url + "/api/v1/pair", json={"code": self.app["pairing"].code}
        ) as response:
            csrf = (await response.json())["csrf_token"]
        async with self.client.post(
            self.url + "/api/v1/sessions",
            json={"conversation_id": "nonexistent-conversation-id"},
            headers={"X-CSRF-Token": csrf},
        ) as response:
            self.assertEqual(response.status, 404)
            data = await response.json()
            self.assertTrue("code" in data or "error" in data or "message" in data)


FIXTURE = r"""
import json
import sys
for line in sys.stdin:
    prompt = json.loads(line)
    text = prompt["message"]["content"][0]["text"]
    if text == "eof":
        break
    if text == "wait":
        import time
        time.sleep(60)
        continue
    print(json.dumps({"event": "init",
                      "conversation_id": "fixture-conversation"}), flush=True)
    print(json.dumps({"event": "step_update", "step_update": {
        "step_type": "agent_response", "text_delta": "Answer " + text}}),
        flush=True)
    print(json.dumps({"event": "result", "result": {
        "status": "SUCCESS", "response": "Answer " + text,
        "conversation_id": "fixture-conversation",
        "usage": {"total_tokens": 10}}}), flush=True)
"""


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AtomicStore(Path(self.folder.name))
        self.cli = CLI()
        self.spawned = []

        async def spawn_fixture(arguments, cwd):
            self.spawned.append(arguments)
            options = (
                {"start_new_session": True} if sys.platform != "win32" else {}
            )
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                "-u",
                "-c",
                FIXTURE,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                **options,
            )
            if sys.platform != "win32":
                proc._companion_pgid = proc.pid
            return proc

        self.cli.spawn = AsyncMock(side_effect=spawn_fixture)
        self.sessions = Sessions(self.store, self.cli)
        self.session = self.sessions.create(
            {"cwd": self.folder.name, "model": "fixture"}
        )

    async def asyncTearDown(self):
        await self.sessions.close()
        self.folder.cleanup()

    async def completed(self, run_id):
        await asyncio.wait_for(self.sessions.tasks[run_id], 5)
        return self.sessions.runs[run_id]

    async def test_two_turns_request_identity_and_durable_resume(self):
        session_id = self.session["session_id"]
        first_request = {"message": "one", "client_request_id": "request-one"}
        first = self.sessions.start(session_id, first_request)
        self.assertEqual(self.sessions.start(session_id, first_request), first)
        with self.assertRaises(RunConflict):
            self.sessions.start(
                session_id, dict(first_request, message="different")
            )
        with self.assertRaises(RunConflict):
            self.sessions.start(
                session_id,
                {"message": "two", "client_request_id": "request-two"},
            )
        self.assertEqual((await self.completed(first))["state"], "completed")
        second = self.sessions.start(
            session_id, {"message": "two", "client_request_id": "request-two"}
        )
        self.assertEqual(
            (await self.completed(second))["response"], "Answer two"
        )
        self.assertEqual(self.session["usage"]["total_tokens"], 10)
        self.assertEqual(len(self.spawned), 1)
        self.assertEqual(
            self.session["conversation_id"], "fixture-conversation"
        )
        await self.sessions.close()
        self.sessions = Sessions(self.store, self.cli)
        third = self.sessions.start(
            session_id,
            {"message": "three", "client_request_id": "request-three"},
        )
        self.assertEqual((await self.completed(third))["state"], "completed")
        self.assertIn("--conversation", self.spawned[-1])
        self.assertEqual(self.spawned[-1][-1], "fixture-conversation")
        self.assertEqual(
            self.sessions.detail(session_id)["runs"][0]["message"], "one"
        )

    async def test_expired_events_keep_history_identity_after_restart(self):
        session_id = self.session["session_id"]
        request = {"message": "retained", "client_request_id": "retained"}
        run_id = self.sessions.start(session_id, request)
        run = await self.completed(run_id)
        sequence = self.sessions.log(run_id).sequence
        with patch(
            "sessions.time.time", return_value=run["completed_at"] + 86401
        ):
            self.sessions.prune_events()
        self.assertFalse((self.store.root / (run_id + ".ndjson")).exists())
        await self.sessions.close()
        self.sessions = Sessions(self.store, self.cli)
        self.assertEqual(self.sessions.log(run_id).sequence, sequence)
        self.assertIsNone(self.sessions.log(run_id).after(sequence))
        self.assertEqual(self.sessions.start(session_id, request), run_id)
        self.assertEqual(
            self.sessions.detail(session_id)["runs"][0]["response"],
            "Answer retained",
        )

    async def test_event_budget_expires_terminal_logs_only(self):
        session_id = self.session["session_id"]
        completed_id = self.sessions.start(
            session_id, {"message": "old", "client_request_id": "old"}
        )
        await self.completed(completed_id)
        running_id = self.sessions.start(
            session_id, {"message": "wait", "client_request_id": "active"}
        )
        with patch("sessions.EVENT_STORAGE_LIMIT", 1):
            self.sessions.prune_events()
        self.assertIsNone(self.sessions.log(completed_id).after(0))
        self.assertTrue((self.store.root / (running_id + ".ndjson")).exists())
        self.assertEqual(self.sessions.runs[running_id]["state"], "running")
        await self.sessions.cancel(running_id)

    async def test_expiry_write_failure_keeps_events_and_history_replayable(
        self,
    ):
        run_id = self.sessions.start(
            self.session["session_id"],
            {"message": "safe", "client_request_id": "safe"},
        )
        run = await self.completed(run_id)
        # Inject failure at the durable filesystem write boundary.
        with patch(
            "storage.os.replace", side_effect=OSError("disk unavailable")
        ):
            with self.assertRaises(OSError):
                self.sessions.expire_events(run)
        self.assertFalse(run.get("events_expired", False))
        self.assertTrue((self.store.root / (run_id + ".ndjson")).exists())
        self.assertIsNotNone(self.sessions.log(run_id).after(0))

    async def test_idle_close_survives_request_cancel_and_rejects_new_turn(
        self,
    ):
        session_id = self.session["session_id"]
        run_id = self.sessions.start(
            session_id, {"message": "one", "client_request_id": "before-close"}
        )
        await self.completed(run_id)
        process = self.sessions.processes[session_id]
        entered = asyncio.Event()
        release = asyncio.Event()

        async def delayed_termination(owned_process):
            entered.set()
            await release.wait()
            await terminate_process(owned_process)

        # Gate the subprocess termination boundary, not session state.
        with patch(
            "sessions.terminate_process", side_effect=delayed_termination
        ):
            closing = asyncio.create_task(
                self.sessions.close_session(session_id)
            )
            try:
                await asyncio.wait_for(entered.wait(), 5)
                closing.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await closing
                with self.assertRaises(RunConflict):
                    self.sessions.start(
                        session_id,
                        {
                            "message": "two",
                            "client_request_id": "during-close",
                        },
                    )
            finally:
                release.set()
                await self.sessions.close_session(session_id)
        self.assertIsNotNone(process.returncode)
        self.assertEqual(
            self.sessions.detail(session_id)["runs"][0]["response"],
            "Answer one",
        )
        next_id = self.sessions.start(
            session_id, {"message": "two", "client_request_id": "after-close"}
        )
        with self.assertRaises(RunConflict):
            await self.sessions.close_session(session_id)
        self.assertEqual(
            (await self.completed(next_id))["response"], "Answer two"
        )
        self.assertIn("--conversation", self.spawned[-1])

    async def test_eof_is_failure_and_cancel_is_idempotent(self):
        session_id = self.session["session_id"]
        failed = self.sessions.start(
            session_id, {"message": "eof", "client_request_id": "eof"}
        )
        self.assertEqual((await self.completed(failed))["state"], "failed")
        cancelled = self.sessions.start(
            session_id, {"message": "wait", "client_request_id": "wait"}
        )
        await asyncio.sleep(0.1)
        await self.sessions.cancel(cancelled)
        self.assertEqual(
            (await self.sessions.cancel(cancelled))["state"], "cancelled"
        )
        self.assertIsNotNone(self.sessions.processes[session_id].returncode)

    async def test_unknown_result_and_restart_never_claim_success(self):
        run_id = self.sessions.start(
            self.session["session_id"],
            {"message": "wait", "client_request_id": "restart"},
        )
        await asyncio.sleep(0.1)
        run = self.sessions.runs[run_id]
        self.sessions.consume(
            self.session,
            run,
            {"event": "result", "result": {"conversation_id": "actual"}},
        )
        self.assertEqual(run["state"], "failed")

    async def test_interactive_permission_prompt_and_resolution(self):
        session = self.session
        # 1. read_file does not need permission
        self.assertFalse(self.sessions.needs_permission(session, "read_file", {}))
        # 2. run_command needs permission under safe mode
        self.assertTrue(self.sessions.needs_permission(session, "run_command", {"command": "ls"}))
        # 3. Autopilot bypasses permission
        self.assertFalse(self.sessions.needs_permission({"autopilot": True}, "run_command", {"command": "ls"}))
        # 4. Whitelisted command bypasses permission
        self.sessions.store.write("settings", {"safe_mode": True, "whitelist": ["run_command(*)"]})
        self.assertFalse(self.sessions.needs_permission(session, "run_command", {"command": "ls"}))

        # 5. resolve_permission resolves pending permission
        run_id = "test-run-perm"
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self.sessions.pending_permissions[run_id] = fut
        resolved = self.sessions.resolve_permission("y", run_id)
        self.assertTrue(resolved)
        self.assertEqual(await fut, "y")
        self.assertNotIn(run_id, self.sessions.pending_permissions)

        # 6. approved_tools is JSON-serializable list and does not break persist
        session.setdefault("approved_tools", []).append("run_command")
        self.sessions.persist()
        # Verify it was written to disk and can be read back as valid JSON
        saved_sessions = self.store.read("sessions")["sessions"]
        self.assertIn("run_command", saved_sessions[session["session_id"]]["approved_tools"])

    def test_event_retention_does_not_return_partial_replay_as_complete(self):
        log = EventLog(self.store.root, "testlog")
        for index in range(510):
            log.append("delta", {"text_delta": str(index)})
        self.assertIsNone(log.after(0))
        self.assertEqual(log.after(509)[0]["id"], 510)

    async def test_restart_marks_interrupted_and_emits_terminal_snapshot(self):
        run_id = self.sessions.start(
            self.session["session_id"],
            {"message": "wait", "client_request_id": "interrupted"},
        )
        await asyncio.sleep(0.1)
        recovered = Sessions(self.store, self.cli)
        self.assertEqual(recovered.runs[run_id]["state"], "interrupted")
        self.assertEqual(recovered.log(run_id).events[-1]["event"], "result")
        self.assertEqual(
            recovered.log(run_id).events[-1]["data"]["state"], "interrupted"
        )

    async def test_transcript_polling_baselines_to_existing_length(self):
        conv_id = "test-conv-" + uuid.uuid4().hex[:12]
        brain_dir = Path.home() / ".gemini" / "antigravity-cli" / "brain"
        conv_dir = brain_dir / conv_id / ".system_generated" / "logs"
        conv_dir.mkdir(parents=True, exist_ok=True)
        t_file = conv_dir / "transcript.jsonl"
        try:
            # 2 pre-existing historical lines
            t_file.write_text(
                json.dumps({"type": "PLANNER_RESPONSE", "thinking": "Old historical thinking"}) + "\n" +
                json.dumps({"type": "TOOL_RESULT", "content": "Old tool result"}) + "\n",
                encoding="utf-8"
            )

            session = dict(self.session, conversation_id=conv_id)
            run = {
                "run_id": "test-baseline-run",
                "state": "running",
                "response": "",
                "usage": {},
            }
            self.sessions.runs[run["run_id"]] = run

            poll_task = asyncio.create_task(self.sessions.poll_transcript(session, run))
            await asyncio.sleep(0.1)

            # Old historical lines must NOT have been emitted to this run
            events = self.sessions.log(run["run_id"]).events
            thoughts = [e["data"].get("text") for e in events if e.get("event") == "thought"]
            self.assertNotIn("Old historical thinking", thoughts)

            # Now append a brand new line during this turn
            with t_file.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"type": "PLANNER_RESPONSE", "thinking": "New turn thinking"}) + "\n")

            await asyncio.sleep(0.7)
            run["state"] = "completed"
            await poll_task

            events_after = self.sessions.log(run["run_id"]).events
            thoughts_after = [e["data"].get("text") for e in events_after if e.get("event") == "thought"]
            self.assertIn("New turn thinking", thoughts_after)
            self.assertNotIn("Old historical thinking", thoughts_after)
        finally:
            import shutil
            shutil.rmtree(brain_dir / conv_id, ignore_errors=True)

    async def test_defunct_running_run_is_pruned_before_capacity_check(self):
        session_id = self.session["session_id"]
        # Simulate an orphaned run marked running whose task is finished/missing
        orphaned_id = "orphaned-run-" + uuid.uuid4().hex[:8]
        self.sessions.runs[orphaned_id] = {
            "run_id": orphaned_id,
            "session_id": session_id,
            "state": "running",
            "message": "stale",
            "client_request_id": "stale-req",
            "fingerprint": "xyz",
            "created_at": time.time() - 3600,
            "usage": {},
        }
        self.session["runs"].append(orphaned_id)

        # check_capacity should reap the dead run and NOT raise RunConflict
        self.sessions.check_capacity(self.session)
        self.assertEqual(self.sessions.runs[orphaned_id]["state"], "interrupted")

    async def test_android_failed_action_is_not_reexecuted(self):
        android = AndroidClient(self.store)
        request = {
            "action_id": "a" * 32 + ":same",
            "action": "click",
            "args": {"index": 1},
        }
        first = await android.execute(request)
        self.assertEqual(first["status"], "failed")
        self.assertEqual(await android.execute(request), first)
        with self.assertRaises(StorageConflict):
            await android.execute(dict(request, args={"index": 2}))


class LegacyTests(unittest.TestCase):
    def test_symlink_cannot_escape_legacy_root(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder) / "home"
            outside = Path(folder) / "outside"
            legacy = LegacyConversations(home)
            legacy.root.mkdir(parents=True)
            target = Path(outside) / ".system_generated" / "logs"
            target.mkdir(parents=True)
            (target / "transcript.jsonl").write_text("{}\n", encoding="utf-8")
            try:
                (legacy.root / "escape").symlink_to(
                    Path(outside), target_is_directory=True
                )
            except OSError:
                self.skipTest(
                    "The operating system does not allow test symlinks"
                )
            with self.assertRaises(PermissionError):
                legacy.transcript_path("escape")

    def test_legacy_conversation_subagent_history_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            legacy = LegacyConversations(home)
            parent_cid = "p" * 32
            child_cid = "c" * 32
            parent_logs = legacy.root / parent_cid / ".system_generated" / "logs"
            child_logs = legacy.root / child_cid / ".system_generated" / "logs"
            parent_logs.mkdir(parents=True)
            child_logs.mkdir(parents=True)

            parent_t = parent_logs / "transcript.jsonl"
            parent_t.write_text(
                json.dumps({
                    "step_index": 1,
                    "type": "USER_INPUT",
                    "content": "<USER_REQUEST>Help me review this code</USER_REQUEST>"
                }) + "\n" +
                json.dumps({
                    "step_index": 2,
                    "type": "PLANNER_RESPONSE",
                    "tool_calls": [{
                        "name": "invoke_subagent",
                        "args": {"Role": "Code Reviewer", "TypeName": "research", "Prompt": "Review files"}
                    }]
                }) + "\n" +
                json.dumps({
                    "step_index": 3,
                    "type": "GENERIC",
                    "content": f'Created the following subagent:\n{{"conversationId": "{child_cid}"}}'
                }) + "\n",
                encoding="utf-8"
            )

            child_t = child_logs / "transcript.jsonl"
            child_t.write_text(
                json.dumps({
                    "step_index": 1,
                    "type": "PLANNER_RESPONSE",
                    "tool_calls": [{
                        "name": "read_file",
                        "args": {"Path": "/data/test.py"}
                    }]
                }) + "\n" +
                json.dumps({
                    "step_index": 2,
                    "type": "GENERIC",
                    "content": "def test(): pass"
                }) + "\n" +
                json.dumps({
                    "step_index": 3,
                    "type": "PLANNER_RESPONSE",
                    "content": "Code review is complete, all clean."
                }) + "\n",
                encoding="utf-8"
            )

            result = legacy.transcript(parent_cid)
            self.assertIn("subagents", result)
            self.assertEqual(len(result["subagents"]), 1)
            sub = result["subagents"][0]
            self.assertEqual(sub["conversation_id"], child_cid)
            self.assertEqual(sub["role"], "Code Reviewer")
            self.assertEqual(sub["type_name"], "research")
            self.assertEqual(len(sub["tools"]), 1)
            self.assertEqual(sub["tools"][0]["name"], "read_file")
            self.assertEqual(sub["tools"][0]["output"], "def test(): pass")
            self.assertIn("Code review is complete", sub["response"])

    def test_legacy_conversation_subagents_array_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            legacy = LegacyConversations(home)
            parent_cid = "p" * 32
            child_cid = "c" * 32
            parent_logs = legacy.root / parent_cid / ".system_generated" / "logs"
            parent_logs.mkdir(parents=True)
            parent_t = parent_logs / "transcript.jsonl"
            parent_t.write_text(
                json.dumps({
                    "step_index": 1,
                    "type": "PLANNER_RESPONSE",
                    "tool_calls": [{
                        "name": "invoke_subagent",
                        "args": {"Subagents": [{"Role": "Security Auditor", "TypeName": "security", "Prompt": "Audit auth"}]}
                    }]
                }) + "\n" +
                json.dumps({
                    "step_index": 2,
                    "type": "GENERIC",
                    "content": f'Created the following subagent:\n{{"conversationId": "{child_cid}"}}'
                }) + "\n",
                encoding="utf-8"
            )
            result = legacy.transcript(parent_cid)
            self.assertEqual(len(result["subagents"]), 1)
            self.assertEqual(result["subagents"][0]["role"], "Security Auditor")
            self.assertEqual(result["subagents"][0]["type_name"], "security")


class AndroidEpochTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AtomicStore(Path(self.folder.name))
        self.android = AndroidClient(self.store)
        self.android.configure(
            {"android_token": "fixture-" * 6, "android_port": 8765}
        )
        self.epoch = "b" * 32

    async def asyncTearDown(self):
        self.folder.cleanup()

    def transport(self, responses):
        packets = [
            SimpleNamespace(type=WSMsgType.TEXT, data=json.dumps(response))
            for response in responses
        ]
        socket = SimpleNamespace(
            receive=AsyncMock(side_effect=packets), send_json=AsyncMock()
        )
        client = MagicMock()
        client.ws_connect.return_value.__aenter__ = AsyncMock(
            return_value=socket
        )
        boundary = MagicMock()
        boundary.return_value.__aenter__ = AsyncMock(return_value=client)
        return socket, patch("android_client.ClientSession", boundary)

    async def test_retired_effect_is_not_sent_and_unresolved_is_preserved(
        self,
    ):
        prior = {
            "action_id": "a" * 32 + ":retired",
            "action": "click",
            "args": {},
        }
        unresolved = dict(prior, action_id="a" * 32 + ":unknown")
        for request, state in (
            (prior, "completed"),
            (unresolved, "outcome_unknown"),
        ):
            digest = hashlib.sha256(
                json.dumps(request, sort_keys=True).encode()
            ).hexdigest()
            self.android.actions[request["action_id"]] = dict(
                request,
                status=state,
                fingerprint=digest,
                result={},
                error=None,
            )
        self.android.persist()
        reading = {"action_id": "read", "action": "tree", "args": {}}
        socket, boundary = self.transport(
            [
                {"type": "journal_ready", "epoch": self.epoch},
                {"action_id": "read", "status": "completed", "result": {}},
            ]
        )
        with boundary:
            await self.android.execute(reading)
        self.assertEqual(
            (await self.android.execute(unresolved))["status"],
            "outcome_unknown",
        )
        socket, boundary = self.transport(
            [{"type": "journal_ready", "epoch": self.epoch}]
        )
        with boundary:
            outcome = await self.android.execute(prior)
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("stale_epoch", outcome["error"])
        socket.send_json.assert_not_called()
        self.assertIn(
            unresolved["action_id"], self.store.read("actions")["actions"]
        )

    async def test_screen_read_does_not_persist_image_or_action(self):
        before = self.store.path("actions").read_bytes()
        socket, boundary = self.transport(
            [
                {"type": "journal_ready", "epoch": self.epoch},
                {
                    "action_id": "read",
                    "status": "completed",
                    "result": {"image_base64": "fixture"},
                },
            ]
        )
        with boundary:
            outcome = await self.android.execute(
                {"action_id": "read", "action": "screenshot"}
            )
        self.assertEqual(outcome["result"]["image_base64"], "fixture")
        self.assertEqual(self.store.path("actions").read_bytes(), before)

    async def test_invalid_journal_identity_never_sends_effect(self):
        socket, boundary = self.transport(
            [{"type": "journal_ready", "epoch": "invalid"}]
        )
        with boundary:
            outcome = await self.android.execute(
                {
                    "action_id": self.epoch + ":new",
                    "action": "back",
                    "args": {},
                }
            )
        self.assertEqual(outcome["status"], "failed")
        socket.send_json.assert_not_called()


class CatalogDiscoveryTests(unittest.TestCase):
    def test_legacy_skill_roots_and_plugin_components_remain_discoverable(
        self,
    ):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            for location in (
                ".gemini/config/skills/legacy",
                ".gemini/skills/direct",
                ".gemini/antigravity-cli/builtin/skills/builtin",
                ".gemini/config/plugins/example/skills/plugin",
            ):
                skill = home / location / "SKILL.md"
                skill.parent.mkdir(parents=True, exist_ok=True)
                skill.write_text("name metadata", encoding="utf-8")
            with patch.object(Path, "home", return_value=home):
                discovered = {entry["id"] for entry in local_catalog("skills")}
            self.assertEqual(
                discovered, {"legacy", "direct", "builtin", "plugin"}
            )


@unittest.skipUnless(sys.platform == "win32", "Windows process ownership")
class WindowsProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_tree_cancellation_is_not_parent_exit_success(self):
        from cli_client import terminate_windows_tree, CLIUnavailable

        terminator = SimpleNamespace(wait=AsyncMock(return_value=128))
        parent = SimpleNamespace(pid=12345, returncode=0, wait=AsyncMock())
        with patch(
            "cli_client.asyncio.create_subprocess_exec",
            return_value=terminator,
        ):
            with self.assertRaises(CLIUnavailable):
                await terminate_windows_tree(parent)

    async def test_cancel_ends_owned_descendants_and_preserves_witness(self):
        import ctypes

        fixture = (
            "import subprocess,sys,time; "
            "child=subprocess.Popen([sys.executable,'-c',"
            "'import time; time.sleep(60)'],stdin=subprocess.DEVNULL,"
            "stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); "
            "print(child.pid,flush=True); time.sleep(60)"
        )
        parent = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            "-c",
            fixture,
            stdout=asyncio.subprocess.PIPE,
        )
        witness = await asyncio.create_subprocess_exec(
            sys.executable,
            "-c",
            "import time; time.sleep(60)",
        )
        child_pid = None
        child_handle = None
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        try:
            child_pid = int(
                await asyncio.wait_for(parent.stdout.readline(), 5)
            )
            child_handle = kernel.OpenProcess(0x100000, False, child_pid)
            self.assertTrue(child_handle)
            self.assertEqual(kernel.WaitForSingleObject(child_handle, 0), 258)
            await asyncio.wait_for(terminate_process(parent), 10)
            self.assertEqual(kernel.WaitForSingleObject(child_handle, 5000), 0)
            self.assertIsNone(witness.returncode)
        finally:
            if child_handle:
                if kernel.WaitForSingleObject(child_handle, 0) == 258:
                    os.kill(child_pid, signal.SIGTERM)
                kernel.CloseHandle(child_handle)
            for process in (parent, witness):
                if process.returncode is None:
                    process.kill()
                await process.wait()


class CLIAdministrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        self.store = AtomicStore(self.root)
        self.cli = CLI()
        self.cli.executable = sys.executable
        self.fixture = self.root / "cli_fixture.py"
        self.fixture.write_text(
            "import pathlib,sys\n"
            "root=pathlib.Path(__file__).parent\n"
            "args=sys.argv[1:]\n"
            "if args==['--version']: print((root/'version').read_text())\n"
            "elif args==['--help']:\n"
            " print('Antigravity CLI v'+(root/'version').read_text())\n"
            " print('  update          Update CLI')\n"
            "elif args==['update','--help']: sys.exit(2)\n"
            "elif args==['update']:\n"
            " (root/'version').write_text('1.2.0')\n"
            " counter=root/'updates'\n"
            " counter.write_text(str(int(counter.read_text())+1))\n"
            " print('secret diagnostic never exposed')\n"
            "elif args==['-p','/usage']:\n"
            " print((root/'quota').read_text())\n",
            encoding="utf-8",
        )
        (self.root / "version").write_text("1.1.0")
        (self.root / "updates").write_text("0")
        (self.root / "quota").write_text(
            "Gemini Models  Five Hour Limit Remaining  83%  "
            "2026-10-07T14:19:14Z"
        )

        async def spawn_fixture(arguments, cwd):
            options = (
                {"start_new_session": True} if sys.platform != "win32" else {}
            )
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                str(self.fixture),
                *arguments,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                **options,
            )
            if sys.platform != "win32":
                proc._companion_pgid = proc.pid
            return proc

        self.boundary = patch.object(self.cli, "spawn", spawn_fixture)
        self.boundary.start()
        self.admin = CLIAdministration(self.cli, self.store)

    async def asyncTearDown(self):
        self.boundary.stop()
        self.folder.cleanup()

    async def test_quota_failure_keeps_last_verified_result_marked_stale(self):
        report = await self.admin.quota(refresh=True)
        self.assertEqual(report["quotas"][0]["remaining_percent"], 83)
        (self.root / "quota").write_text("Login required secret-token")
        failed = await self.admin.quota(refresh=True)
        self.assertTrue(failed["stale"])
        self.assertEqual(failed["fetched_at"], report["fetched_at"])
        self.assertEqual(failed["quotas"], report["quotas"])
        self.assertNotIn("secret-token", json.dumps(failed))

    async def test_update_replay_does_not_rerun_and_version_is_verified(self):
        first = await self.admin.update("request-one", lambda: True)
        second = await self.admin.update("request-one", lambda: True)
        restored = CLIAdministration(self.cli, self.store)
        replay = await restored.update("request-one", lambda: True)
        self.assertEqual(first["status"], "completed")
        self.assertEqual(first["version_after"], "1.2.0")
        self.assertEqual(second, first)
        self.assertEqual(replay, first)
        self.assertEqual((self.root / "updates").read_text(), "1")
        self.assertNotIn("secret diagnostic", json.dumps(first))

    async def test_update_blocks_live_work_or_missing_version_without_mutation(
        self,
    ):
        with self.assertRaises(ValueError):
            await self.admin.update("busy", lambda: False)
        (self.root / "version").write_text("unverified")
        with self.assertRaises(CLIUnavailable):
            await self.admin.update("no-version", lambda: True)
        self.assertEqual((self.root / "updates").read_text(), "0")

    async def test_restart_keeps_unknown_update_without_repeating_it(self):
        self.store.write(
            "cli-administration",
            {
                "updates": {
                    "unknown-one": {
                        "request_id": "unknown-one",
                        "status": "running",
                    }
                }
            },
        )
        restored = CLIAdministration(self.cli, self.store)
        reply = await restored.update("unknown-one", lambda: True)
        self.assertEqual(reply["status"], "outcome_unknown")
        self.assertEqual((self.root / "updates").read_text(), "0")


class CLIParsingTests(unittest.TestCase):
    def test_quota_report_rejects_unknown_and_out_of_range_values(self):
        for text in (
            "",
            "Login required",
            "Gemini Models  Weekly Limit Remaining  "
            "101%  2026-10-07T00:00:00Z",
            "Gemini Models  Weekly Limit Remaining  80%  unknown",
        ):
            with self.subTest(text=text), self.assertRaises(CLIUnavailable):
                parse_quota_report(text)

    def test_models_are_validated_text_and_never_fake_defaults(self):
        self.assertEqual(parse_listing("Login required", "models"), [])
        self.assertEqual(
            parse_listing("gemini-2.5-pro  Gemini 2.5 Pro", "models"),
            [{"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"}],
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
