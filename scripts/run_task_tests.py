"""Exercise local task outcomes, cancellation and observed subagents."""

import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from sessions import RunConflict, Sessions  # noqa: E402
from storage import AtomicStore  # noqa: E402
from task_runtime import TaskRuntime  # noqa: E402


class FakeCLI:
    def __init__(self, outcome="SUCCESS"):
        self.outcome = outcome
        self.calls = 0

    async def spawn(self, arguments, cwd):
        self.calls += 1
        script = (
            "import json,sys,time\n"
            "sys.stdin.readline()\n"
            "print(json.dumps({'event':'init',"
            "'conversation_id':'owned-conversation','init':"
            "{'tools':['schedule','manage_task','invoke_subagent']}}),"
            "flush=True)\n"
        )
        if self.outcome == "wait":
            script += "time.sleep(60)\n"
        elif self.outcome != "EOF":
            script += (
                "print(json.dumps({'event':'result','result':"
                "{'status':" + repr(self.outcome) + ","
                "'conversation_id':'owned-conversation',"
                "'response':'private result'}}),flush=True)\n"
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


class TaskTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = AtomicStore(self.folder.name)
        self.cli = FakeCLI()
        self.sessions = Sessions(self.store, self.cli)
        self.runtime = TaskRuntime(self.sessions)
        self.session = self.sessions.create({"cwd": self.folder.name})

    async def asyncTearDown(self):
        await self.sessions.close()
        self.folder.cleanup()

    def start(self):
        return self.sessions.start(
            self.session["session_id"],
            {"message": "private prompt", "client_request_id": "request-one"},
        )

    async def wait_task(self, run_id):
        await asyncio.wait_for(self.sessions.tasks[run_id], 10)

    async def test_completion_comes_from_result_not_time(self):
        run_id = self.start()
        await self.wait_task(run_id)
        row = self.runtime.detail(run_id)
        self.assertEqual(row["state"], "completed")
        self.assertEqual(row["kind"], "conversation_turn")
        self.assertNotIn("private", json.dumps(self.runtime.listing()))

    async def test_eof_is_failed_not_completed(self):
        self.cli.outcome = "EOF"
        run_id = self.start()
        await self.wait_task(run_id)
        self.assertEqual(self.runtime.detail(run_id)["state"], "failed")

    async def test_cancel_owns_only_its_process(self):
        self.cli.outcome = "wait"
        witness = await asyncio.create_subprocess_exec(
            sys.executable, "-c", "import time; time.sleep(60)"
        )
        try:
            run_id = self.start()
            for _ in range(100):
                process = self.sessions.processes.get(
                    self.session["session_id"]
                )
                if process:
                    break
                await asyncio.sleep(0.01)
            self.assertIsNotNone(process)
            result = await self.runtime.cancel(run_id)
            self.assertEqual(result["state"], "cancelled")
            self.assertIsNotNone(process.returncode)
            self.assertIsNone(witness.returncode)
        finally:
            witness.terminate()
            await witness.wait()

    async def test_running_record_without_owner_cannot_claim_cancelled(self):
        self.sessions.runs["orphan"] = {
            "run_id": "orphan",
            "session_id": self.session["session_id"],
            "state": "running",
            "created_at": 0,
        }
        with self.assertRaises(RunConflict):
            await self.runtime.cancel("orphan")
        self.assertEqual(self.sessions.runs["orphan"]["state"], "running")
        self.sessions.runs["orphan"]["state"] = "interrupted"

    async def test_other_run_cannot_borrow_session_process_ownership(self):
        self.cli.outcome = "wait"
        owned_id = self.start()
        for _ in range(100):
            if self.session["session_id"] in self.sessions.processes:
                break
            await asyncio.sleep(0.01)
        self.sessions.runs["orphan"] = {
            "run_id": "orphan",
            "session_id": self.session["session_id"],
            "state": "running",
            "created_at": 0,
        }
        try:
            with self.assertRaises(RunConflict):
                await self.runtime.cancel("orphan")
            self.assertEqual(self.sessions.runs[owned_id]["state"], "running")
        finally:
            self.sessions.runs["orphan"]["state"] = "interrupted"
            await self.runtime.cancel(owned_id)

    async def test_restart_retains_unknown_result_without_respawn(self):
        run = {
            "run_id": "old",
            "session_id": self.session["session_id"],
            "state": "running",
            "created_at": 0,
            "response": "",
            "usage": {},
            "observed_subagents": [
                {"conversation_id": "a" * 32, "type_name": "worker"}
            ],
        }
        self.session["runs"].append("old")
        self.sessions.runs["old"] = run
        self.sessions.persist()
        restored_cli = FakeCLI()
        restored = Sessions(self.store, restored_cli)
        try:
            listing = TaskRuntime(restored).listing()
            self.assertEqual(listing["tasks"][0]["state"], "interrupted")
            self.assertEqual(listing["subagents"][0]["state"], "observed")
            self.assertFalse(listing["subagents"][0]["cancellable"])
            self.assertEqual(restored_cli.calls, 0)
        finally:
            await restored.close()
        self.sessions.runs["old"]["state"] = "interrupted"

    async def test_tool_catalog_does_not_invent_live_subagents(self):
        run_id = self.start()
        await self.wait_task(run_id)
        run = self.sessions.runs[run_id]
        self.runtime.observe(
            run,
            {
                "event": "init",
                "init": {
                    "tools": [
                        "schedule",
                        "manage_subagents",
                        "invoke_subagent",
                    ]
                },
            },
        )
        listing = self.runtime.listing()
        self.assertEqual(listing["subagents"], [])
        self.assertFalse(listing["capabilities"]["native_schedule_crud"])

    async def test_observed_subagents_are_bounded_private_and_deduplicated(
        self,
    ):
        run_id = self.start()
        await self.wait_task(run_id)
        event = {
            "event": "step_update",
            "step_update": {
                "subagent_info": {
                    "subagents": [
                        {
                            "conversation_id": "a" * 32,
                            "type_name": "worker",
                            "log_uri": "private log",
                            "workspace_uris": ["private path"],
                            "role": "private prompt",
                        },
                        {"conversation_id": {}, "type_name": "malformed"},
                    ]
                }
            },
        }
        self.runtime.observe(self.sessions.runs[run_id], event)
        self.runtime.observe(self.sessions.runs[run_id], event)
        listing = self.runtime.listing()
        self.assertEqual(len(listing["subagents"]), 1)
        self.assertEqual(listing["subagents"][0]["parent_run_id"], run_id)
        self.assertNotIn("private", json.dumps(listing))
        self.assertNotIn("role", listing["subagents"][0])

    async def test_unknown_id_does_not_mutate_owned_runs(self):
        with self.assertRaises(KeyError):
            await self.runtime.cancel("unknown")
        self.assertEqual(self.runtime.listing()["tasks"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
