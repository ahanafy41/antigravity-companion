"""Local queue and once-schedule regression checks without an agy account."""

import asyncio
import hashlib
from datetime import datetime, timezone
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from local_tasks import LocalTasks  # noqa: E402
from sessions import RunConflict, Sessions  # noqa: E402
from storage import AtomicStore, StorageConflict  # noqa: E402


class FakeCLI:
    def __init__(self):
        self.calls = 0

    async def spawn(self, arguments, cwd):
        self.calls += 1
        script = (
            "import json,sys,time\n"
            "for line in sys.stdin:\n"
            " message=json.loads(line)['message']['content'][0]['text']\n"
            " print(json.dumps({'event':'init','conversation_id':'owned'}),"
            "flush=True)\n"
            " if message=='hold': time.sleep(60)\n"
            " print(json.dumps({'event':'result','result':{'status':'SUCCESS',"
            "'conversation_id':'owned','response':message}}),flush=True)\n"
        )
        return await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            "-c",
            script,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )


class ScheduleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AtomicStore(self.folder.name)
        self.cli = FakeCLI()
        self.sessions = Sessions(self.store, self.cli)
        self.session = self.sessions.create(
            {
                "cwd": self.folder.name,
                "model": "chosen",
                "effort": "low",
                "sandbox": True,
            }
        )
        self.now = 1000.0
        self.engine = LocalTasks(
            self.store, self.sessions, clock=lambda: self.now
        )

    async def asyncTearDown(self):
        await self.engine.close()
        await self.sessions.close()
        self.folder.cleanup()

    def queued(self, request_id="one", message="first"):
        return self.engine.create(
            {
                "mode": "queued",
                "session_id": self.session["session_id"],
                "message": message,
                "request_id": request_id,
            }
        )

    def schedule(self, request_id, due, policy="run_once"):
        at = datetime.fromtimestamp(due, timezone.utc).isoformat()
        return self.engine.create(
            {
                "mode": "scheduled",
                "session_id": self.session["session_id"],
                "message": "scheduled",
                "request_id": request_id,
                "scheduled_at": at,
                "missed_policy": policy,
            }
        )

    async def finish(self, entry):
        row = self.engine.detail(entry["task_id"])
        await asyncio.wait_for(self.sessions.tasks[row["run_id"]], 10)
        await self.engine.tick()
        return self.engine.detail(entry["task_id"])

    async def test_queue_serializes_real_turns_and_preserves_options(self):
        first, second = self.queued(), self.queued("two", "second")
        options = {
            k: self.session[k] for k in ("model", "effort", "sandbox", "cwd")
        }
        await self.engine.tick()
        self.assertEqual(
            self.engine.detail(second["task_id"])["state"], "pending"
        )
        done = await self.finish(first)
        self.assertEqual(done["state"], "completed")
        done_two = await self.finish(second)
        self.assertEqual(done_two["state"], "completed")
        self.assertEqual(
            self.sessions.runs[done_two["run_id"]]["response"], "second"
        )
        self.assertEqual(options, {k: self.session[k] for k in options})

    async def test_duplicate_request_conflict_and_pending_cancel(self):
        entry = self.queued()
        self.assertEqual(entry["task_id"], self.queued()["task_id"])
        with self.assertRaises(StorageConflict):
            self.queued(message="different")
        cancelled = await self.engine.cancel(entry["task_id"])
        await self.engine.tick()
        self.assertEqual(cancelled["state"], "cancelled")
        self.assertEqual(self.cli.calls, 0)

    async def test_schedule_waits_until_due_then_uses_real_result(self):
        entry = self.schedule("later", 1010)
        await self.engine.tick()
        self.assertFalse(self.sessions.runs)
        self.now = 1011
        await self.engine.tick()
        self.assertEqual((await self.finish(entry))["state"], "completed")
        self.assertEqual(
            self.engine.detail(entry["task_id"])["timezone"], "UTC"
        )

    async def test_missed_skip_and_run_once_are_explicit(self):
        skipped = self.schedule("skip", 900, "skip")
        once = self.schedule("once", 900)
        await self.engine.tick()
        self.assertEqual(
            self.engine.detail(skipped["task_id"])["state"], "skipped"
        )
        self.assertEqual((await self.finish(once))["state"], "completed")
        await self.engine.tick()
        self.assertEqual(len(self.sessions.runs), 1)

    async def test_restart_pending_due_follows_missed_policy(self):
        entry = self.schedule("restart-skip", 1010, "skip")
        self.now = 1020
        restored = LocalTasks(
            self.store, self.sessions, clock=lambda: self.now
        )
        try:
            await restored.tick()
            self.assertEqual(
                restored.detail(entry["task_id"])["state"], "skipped"
            )
            self.assertFalse(self.sessions.runs)
        finally:
            await restored.close()

    async def test_dispatch_gap_reconciles_stable_request_without_replay(self):
        entry = self.queued()
        internal = self.engine.entries[entry["task_id"]]
        internal["state"] = "dispatching"
        self.engine.persist()
        run_id = self.sessions.start(
            self.session["session_id"],
            {
                "message": internal["message"],
                "client_request_id": internal["occurrence_id"],
            },
        )
        await asyncio.wait_for(self.sessions.tasks[run_id], 10)
        restored = LocalTasks(
            self.store, self.sessions, clock=lambda: self.now
        )
        try:
            await restored.tick()
            self.assertEqual(
                restored.detail(entry["task_id"])["run_id"], run_id
            )
            self.assertEqual(
                restored.detail(entry["task_id"])["state"], "completed"
            )
            self.assertEqual(len(self.sessions.runs), 1)
            self.assertEqual(self.cli.calls, 1)
        finally:
            await restored.close()

    async def test_restart_unknown_dispatch_is_not_replayed(self):
        entry = self.queued()
        self.engine.entries[entry["task_id"]]["state"] = "dispatching"
        self.engine.persist()
        restored = LocalTasks(
            self.store, self.sessions, clock=lambda: self.now
        )
        try:
            await restored.tick()
            self.assertEqual(
                restored.detail(entry["task_id"])["state"], "interrupted"
            )
            self.assertFalse(self.sessions.runs)
        finally:
            await restored.close()

    async def test_failed_intent_persistence_never_dispatches(self):
        self.queued()
        with patch.object(self.engine, "persist", side_effect=OSError("disk")):
            with self.assertRaises(OSError):
                await self.engine.tick()
        self.assertFalse(self.sessions.runs)
        self.assertEqual(self.cli.calls, 0)

    async def test_running_cancel_stops_only_owned_turn(self):
        entry = self.queued(message="hold")
        witness = await asyncio.create_subprocess_exec(
            sys.executable, "-c", "import time;time.sleep(60)"
        )
        try:
            await self.engine.tick()
            for _ in range(100):
                process = self.sessions.processes.get(
                    self.session["session_id"]
                )
                if process:
                    break
                await asyncio.sleep(0.01)
            self.assertIsNotNone(process)
            result = await self.engine.cancel(entry["task_id"])
            self.assertEqual(result["state"], "cancelled")
            self.assertIsNotNone(process.returncode)
            self.assertIsNone(witness.returncode)
        finally:
            witness.terminate()
            await witness.wait()

    async def test_pending_cancel_persistence_failure_does_not_claim_cancelled(
        self,
    ):
        entry = self.queued()
        with patch.object(self.engine, "persist", side_effect=OSError("disk")):
            with self.assertRaises(OSError):
                await self.engine.cancel(entry["task_id"])
        self.assertEqual(
            self.engine.detail(entry["task_id"])["state"], "pending"
        )
        saved = self.store.read("local-tasks")["tasks"][entry["task_id"]]
        self.assertEqual(saved["state"], "pending")

    async def test_unowned_running_record_cancellation_remains_unconfirmed(
        self,
    ):
        entry = self.queued()
        internal = self.engine.entries[entry["task_id"]]
        internal.update(state="running", run_id="unowned")
        self.sessions.runs["unowned"] = {
            "run_id": "unowned",
            "session_id": internal["session_id"],
            "client_request_id": internal["occurrence_id"],
            "fingerprint": hashlib.sha256(
                internal["message"].encode()
            ).hexdigest(),
            "state": "running",
        }
        with self.assertRaises(RunConflict):
            await self.engine.cancel(entry["task_id"])
        self.assertEqual(internal["state"], "running")
        self.assertFalse(self.engine.detail(entry["task_id"])["cancellable"])
        self.sessions.runs["unowned"]["state"] = "interrupted"

    async def test_capacity_waits_without_dispatch_claim(self):
        first = self.queued(message="hold")
        await self.engine.tick()
        second = self.queued("two", "second")
        await self.engine.tick()
        saved = self.store.read("local-tasks")["tasks"][second["task_id"]]
        self.assertEqual(saved["state"], "pending")
        self.assertIsNone(saved["run_id"])
        await self.engine.cancel(first["task_id"])

    async def test_close_stops_worker_before_sessions_shutdown(self):
        self.engine.ready = lambda: False
        entry = self.queued()
        await self.engine.start()
        await asyncio.sleep(0)
        await self.engine.close()
        self.engine.ready = lambda: True
        await self.engine.tick()
        self.assertTrue(self.engine.worker.done())
        self.assertEqual(
            self.engine.detail(entry["task_id"])["state"], "pending"
        )
        self.assertFalse(self.sessions.runs)

    async def test_updater_guard_keeps_pending(self):
        self.engine.ready = lambda: False
        entry = self.queued()
        await self.engine.tick()
        self.assertEqual(
            self.engine.detail(entry["task_id"])["state"], "pending"
        )
        self.assertFalse(self.sessions.runs)

    def test_invalid_payload_timestamp_and_policy_rejected(self):
        base = {
            "mode": "scheduled",
            "session_id": self.session["session_id"],
            "request_id": "bad",
            "message": "message",
            "missed_policy": "skip",
        }
        for values in [
            {"scheduled_at": "2026-01-01T10:00:00"},
            {"scheduled_at": "invalid"},
            {"scheduled_at": True},
            {"scheduled_at": []},
            {"scheduled_at": "2026-01-01T10:00:00Z", "mode": []},
            {
                "scheduled_at": "2026-01-01T10:00:00Z",
                "missed_policy": "ignore",
            },
            {"scheduled_at": "2026-01-01T10:00:00Z", "session_id": "missing"},
        ]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.engine.create(dict(base, **values))
        self.assertFalse(self.engine.entries)


if __name__ == "__main__":
    unittest.main(verbosity=2)
