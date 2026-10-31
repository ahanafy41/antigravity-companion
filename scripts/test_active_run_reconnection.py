import asyncio
import tempfile
import unittest
from pathlib import Path
import time
import json

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from storage import AtomicStore
from sessions import Sessions
from legacy_conversations import LegacyConversations

class DummyCLI:
    async def models(self):
        return []

class ActiveRunReconnectionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = Path(self.temp_dir.name)
        self.cli = DummyCLI()
        self.sessions = Sessions(AtomicStore(self.store), self.cli)

    async def asyncTearDown(self):
        await self.sessions.close()
        self.temp_dir.cleanup()

    async def test_session_detail_reports_active_run_metadata(self):
        session = self.sessions.create({})
        session_id = session["session_id"]
        run_id = self.sessions.start(session_id, {"message": "hello test", "client_request_id": "req-1"})
        
        detail = self.sessions.detail(session_id)
        self.assertIn("active_run", detail)
        active = detail["active_run"]
        self.assertIsNotNone(active)
        self.assertEqual(active["run_id"], run_id)
        self.assertEqual(active["state"], "running")
        self.assertEqual(active["message"], "hello test")

        # Now mark the run completed
        run = self.sessions.runs[run_id]
        self.sessions.finish(self.sessions.sessions[session_id], run, "completed")
        detail_after = self.sessions.detail(session_id)
        self.assertIsNone(detail_after.get("active_run"))

    async def test_legacy_transcript_preserves_tools_and_thoughts_without_empty_fallback(self):
        # Create a mock transcript.jsonl
        conv_id = "test-conv-123"
        brain_dir = Path(self.temp_dir.name) / ".gemini" / "antigravity-cli" / "brain"
        t_dir = brain_dir / conv_id / ".system_generated" / "logs"
        t_dir.mkdir(parents=True, exist_ok=True)
        t_file = t_dir / "transcript.jsonl"

        entries = [
            {"type": "USER_INPUT", "source": "USER_EXPLICIT", "content": "<USER_REQUEST>help me fix</USER_REQUEST>", "created_at": "2026-10-31T20:00:00Z"},
            {
                "type": "PLANNER_RESPONSE",
                "thinking": "analyzing root cause",
                "content": "",
                "tool_calls": [{"name": "read_file", "args": {"Path": "/path/to/test.py", "toolSummary": "Read code"}}],
                "created_at": "2026-10-31T20:00:05Z"
            },
            {"type": "GENERIC", "content": "file contents line 1\nline 2", "created_at": "2026-10-31T20:00:06Z"},
            {
                "type": "PLANNER_RESPONSE",
                "content": "Fixed the file successfully.",
                "thinking": "verification done",
                "tool_calls": [],
                "created_at": "2026-10-31T20:00:10Z"
            }
        ]
        with t_file.open("w", encoding="utf-8") as f:
            for e in entries:
                f.write(json.dumps(e) + "\n")

        legacy = LegacyConversations(self.temp_dir.name)
        res = legacy.transcript(conv_id)
        messages = res["messages"]
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "user")
        self.assertEqual(messages[0]["text"], "help me fix")

        agent_msg = messages[1]
        self.assertEqual(agent_msg["role"], "agent")
        self.assertIn("Fixed the file", agent_msg["text"])
        self.assertIn("analyzing root cause", agent_msg["thinking"])
        self.assertEqual(len(agent_msg["tools"]), 1)
        self.assertEqual(agent_msg["tools"][0]["name"], "read_file")

if __name__ == "__main__":
    unittest.main()
