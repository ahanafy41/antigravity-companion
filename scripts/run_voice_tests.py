"""Offline regression checks for bounded voice planning and device outcomes."""

import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from storage import AtomicStore  # noqa: E402
from voice_agent import VoiceAgent, parse_step  # noqa: E402
from cli_client import CLIUnavailable  # noqa: E402


class Device:
    def __init__(self, status="completed"):
        self.status = status
        self.calls = []

    async def journal_identity(self):
        return {"epoch": "a" * 32}

    async def execute(self, request):
        self.calls.append(request)
        return {"status": self.status, "result": {"ok": True}}


class VoiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AtomicStore(self.folder.name)
        self.device = Device()
        self.steps = []

        async def planner(session, prompt):
            return json.dumps(self.steps.pop(0))

        self.agent = VoiceAgent(self.store, planner, self.device)
        self.session = {"session_id": "session", "cwd": "."}

    async def asyncTearDown(self):
        await self.agent.close()
        self.folder.cleanup()

    async def settled(self, record):
        await self.agent.tasks[record["voice_id"]]
        return self.agent.detail(record["voice_id"])

    async def test_verified_action_then_speech_and_duplicate_request(self):
        self.steps = [
            {"action": "home", "args": {}, "done": False},
            {"action": None, "args": {}, "done": True, "text": "انتهى"},
        ]
        record = self.agent.start(
            self.session, {"request_id": "one", "text": "اذهب إلى الشاشة"}
        )
        finished = await self.settled(record)
        self.assertEqual(finished["state"], "completed")
        self.assertEqual(
            [r["action"] for r in self.device.calls], ["home", "speak"]
        )
        self.assertTrue(
            all(
                r["action_id"].startswith("a" * 32 + ":")
                for r in self.device.calls
            )
        )
        self.assertEqual(
            self.agent.start(
                self.session, {"request_id": "one", "text": "اذهب إلى الشاشة"}
            )["voice_id"],
            record["voice_id"],
        )
        self.assertEqual(len(self.device.calls), 2)

    async def test_failed_device_action_stops_loop_and_speech(self):
        self.steps = [{"action": "home", "args": {}, "done": False}]
        self.device.status = "failed"
        record = self.agent.start(
            self.session, {"request_id": "fail", "text": "home"}
        )
        self.assertEqual((await self.settled(record))["state"], "failed")
        self.assertEqual(len(self.device.calls), 1)

    async def test_cancel_stops_planner_before_any_action(self):
        entered = asyncio.Event()

        async def waiting(session, prompt):
            entered.set()
            await asyncio.Event().wait()

        self.agent.planner = waiting
        record = self.agent.start(
            self.session, {"request_id": "cancel", "text": "home"}
        )
        await entered.wait()
        result = await self.agent.cancel(record["voice_id"])
        self.assertEqual(result["state"], "cancelled")
        self.assertNotIn("home", [r["action"] for r in self.device.calls])

    async def test_restart_marks_unknown_work_interrupted(self):
        self.store.write(
            "voice-runs",
            {"runs": {"old": {"voice_id": "old", "state": "running"}}},
        )
        recovered = VoiceAgent(self.store, self.agent.planner, self.device)
        self.assertEqual(recovered.detail("old")["state"], "interrupted")
        self.assertFalse(recovered.tasks)
        await recovered.close()

    async def test_cli_failure_finishes_as_failed(self):
        async def failed(session, prompt):
            raise CLIUnavailable("fixture transport failure")

        self.agent.planner = failed
        record = self.agent.start(
            self.session, {"request_id": "transport", "text": "home"}
        )
        self.assertEqual((await self.settled(record))["state"], "failed")

    async def test_cancel_during_device_marks_uncertain_effect(self):
        entered = asyncio.Event()

        async def waiting(request):
            entered.set()
            await asyncio.Event().wait()

        self.device.execute = waiting
        self.steps = [{"action": "home", "args": {}, "done": False}]
        record = self.agent.start(
            self.session, {"request_id": "effect", "text": "home"}
        )
        await entered.wait()
        cancelled = await self.agent.cancel(record["voice_id"])
        self.assertTrue(cancelled["outcome_unknown"])
        self.assertEqual(cancelled["steps"][0]["status"], "outcome_unknown")

    async def test_cancel_before_start_creates_a_durable_tombstone(self):
        await self.agent.cancel_request("later")
        record = self.agent.start(
            self.session, {"request_id": "later", "text": "home"}
        )
        self.assertEqual(record["state"], "cancelled")
        self.assertNotIn(record["voice_id"], self.agent.tasks)
        self.assertFalse(self.device.calls)

    def test_requires_explicit_action_and_scalar_type(self):
        for step in [
            {"done": True, "args": {}},
            {"action": [], "args": {}, "done": False},
            {"action": {}, "args": {}, "done": False},
        ]:
            with self.subTest(step=step), self.assertRaises(ValueError):
                parse_step(json.dumps(step))

    def test_invalid_or_generated_code_never_becomes_action(self):
        for step in [
            {"action": "run_code", "args": {}, "done": False},
            {"action": "home", "args": {}, "done": True},
            {"action": None, "args": {}, "done": False},
            {"action": "home", "args": {}, "done": "false"},
        ]:
            with self.subTest(step=step), self.assertRaises(ValueError):
                parse_step(json.dumps(step))


if __name__ == "__main__":
    unittest.main(verbosity=2)
