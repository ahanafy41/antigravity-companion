"""Verify speech cancellation bypasses only the Android speech wait."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from android_client import AndroidClient  # noqa: E402
from storage import AtomicStore, StorageConflict  # noqa: E402


class ControlledClient(AndroidClient):
    def __init__(self, store):
        super().__init__(store)
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancel_reached = asyncio.Event()
        self.calls = []

    async def exchange(self, request, outcome):
        self.calls.append(request["action"])
        if request["action"] == "speak":
            self.started.set()
            await self.release.wait()
        elif request["action"] == "speech_cancel":
            self.cancel_reached.set()
            self.release.set()
        outcome.update(status="completed", result={"ok": True}, error=None)


class TTSTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AtomicStore(self.folder.name)
        self.client = ControlledClient(self.store)
        self.tasks = []

    async def asyncTearDown(self):
        for task in self.tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.folder.cleanup()

    def request(self, action, suffix):
        return {
            "action_id": "a" * 32 + ":" + suffix,
            "action": action,
            "args": {},
        }

    def spawn(self, request):
        task = asyncio.create_task(self.client.execute(request))
        self.tasks.append(task)
        return task

    async def test_control_cancel_reaches_active_speech(self):
        speaking = self.spawn(self.request("speak", "one"))
        await self.client.started.wait()
        cancelling = self.spawn(self.request("speech_cancel", "stop"))
        result = await asyncio.wait_for(cancelling, 0.5)
        self.assertTrue(self.client.cancel_reached.is_set())
        self.assertEqual(result["status"], "completed")
        await speaking

    async def test_regular_mutation_does_not_pass_speech_lock(self):
        speaking = self.spawn(self.request("speak", "one"))
        await self.client.started.wait()
        ordinary = self.spawn(self.request("home", "home"))
        await asyncio.sleep(0)
        self.assertNotIn("home", self.client.calls)
        await asyncio.wait_for(
            self.client.execute(self.request("speech_cancel", "stop")), 0.5
        )
        await speaking
        await ordinary
        self.assertEqual(self.client.calls, ["speak", "speech_cancel", "home"])

    async def test_concurrent_duplicate_speech_has_one_effect_and_final_cache(
        self,
    ):
        request = self.request("speak", "one")
        first = self.spawn(request)
        await self.client.started.wait()
        duplicate = self.spawn(dict(request))
        await asyncio.sleep(0)
        self.client.release.set()
        one, two = await asyncio.gather(first, duplicate)
        self.assertEqual(one, two)
        self.assertEqual(one["status"], "completed")
        self.assertEqual(self.client.calls, ["speak"])
        self.assertEqual(await self.client.execute(request), one)
        self.assertEqual(self.client.calls, ["speak"])

    async def test_cancel_id_cannot_alias_running_speech_identity(self):
        speaking = self.spawn(self.request("speak", "one"))
        await self.client.started.wait()
        with self.assertRaises(StorageConflict):
            await asyncio.wait_for(
                self.client.execute(self.request("speech_cancel", "one")), 0.5
            )
        self.assertEqual(self.client.calls, ["speak"])
        self.client.release.set()
        await speaking

    async def test_cancelled_speech_is_saved_unknown_and_never_retried(self):
        request = self.request("speak", "one")
        speaking = self.spawn(request)
        await self.client.started.wait()
        speaking.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await speaking
        self.assertEqual(
            self.client.actions[request["action_id"]]["status"],
            "outcome_unknown",
        )
        saved = self.store.read("actions")["actions"][request["action_id"]]
        self.assertEqual(saved["status"], "outcome_unknown")
        result = await self.client.execute(request)
        self.assertEqual(result["status"], "outcome_unknown")
        self.assertEqual(self.client.calls, ["speak"])

    async def test_cancel_persistence_failure_propagates_without_false_success(
        self,
    ):
        request = self.request("speak", "one")
        speaking = self.spawn(request)
        await self.client.started.wait()
        with patch.object(self.client, "persist", side_effect=OSError("disk")):
            speaking.cancel()
            with self.assertRaises(OSError):
                await speaking
        self.assertEqual(
            self.client.actions[request["action_id"]]["status"],
            "outcome_unknown",
        )
        recovered = AndroidClient(self.store)
        self.assertEqual(
            recovered.actions[request["action_id"]]["status"],
            "outcome_unknown",
        )
        self.assertEqual(self.client.calls, ["speak"])

    async def test_reservation_persistence_failure_sends_no_effect(self):
        request = self.request("speak", "one")
        with patch.object(self.client, "persist", side_effect=OSError("disk")):
            with self.assertRaises(OSError):
                await self.client.execute(request)
        self.assertEqual(self.client.calls, [])
        self.assertNotIn(request["action_id"], self.client.actions)

    async def test_stop_still_rejects_stale_epoch_without_sending(self):
        client = AndroidClient(self.store)
        client.configuration = {"android_token": "private"}
        sent = []

        class Socket:
            async def send_json(self, request):
                sent.append(request)

        @asynccontextmanager
        async def journal():
            yield Socket(), "b" * 32

        with patch.object(client, "journal_connection", journal):
            for action in ("speak", "speech_cancel"):
                result = await client.execute(self.request(action, action))
                self.assertEqual(result["status"], "failed")
                self.assertIn("stale_epoch", result["error"])
        self.assertEqual(sent, [])

    async def test_transport_failure_is_unknown_and_duplicate_never_resends(
        self,
    ):
        client = AndroidClient(self.store)
        client.configuration = {"android_token": "private"}
        sent = []

        class Socket:
            async def send_json(self, request):
                sent.append(request)

            async def receive(self):
                raise OSError("connection lost after send")

        @asynccontextmanager
        async def journal():
            yield Socket(), "a" * 32

        request = self.request("speech_cancel", "stop")
        with patch.object(client, "journal_connection", journal):
            first = await client.execute(request)
            duplicate = await client.execute(request)
        self.assertEqual(first["status"], "outcome_unknown")
        self.assertEqual(first, duplicate)
        self.assertEqual(len(sent), 1)
        saved = self.store.read("actions")["actions"][request["action_id"]]
        self.assertEqual(saved["status"], "outcome_unknown")

    async def test_concurrent_duplicate_cancel_has_one_effect(self):
        request = self.request("speech_cancel", "stop")
        first, second = await asyncio.gather(
            self.client.execute(request), self.client.execute(dict(request))
        )
        self.assertEqual(first, second)
        self.assertEqual(self.client.calls, ["speech_cancel"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
