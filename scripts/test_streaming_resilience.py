import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from sessions import EventLog, TERMINAL

class TestStreamingResilience(unittest.IsolatedAsyncioTestCase):
    def test_event_log_after_cursor_behind_ring_buffer_contract(self):
        """Contract test: when cursor is behind ring buffer, after() returns None to indicate replay discontinuity."""
        with tempfile.TemporaryDirectory() as tmpdir:
            log = EventLog(tmpdir, "run_test_ring")
            for i in range(10):
                log.append("delta", {"text_delta": f"token_{i}"})
            
            # Simulate ring buffer pruning by popping from left
            log.events.popleft()
            log.events.popleft()
            
            oldest_id = log.events[0]["id"]
            self.assertGreater(oldest_id, 1)
            
            # Requesting cursor 0 (behind oldest_id - 1) returns None per event retention invariants
            events = log.after(0)
            self.assertIsNone(events)

    def test_event_log_after_terminal_or_fresh(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            log = EventLog(tmpdir, "run_test_fresh")
            log.append("delta", {"text_delta": "hello"})
            log.append("result", {"response": "done", "state": "completed"})
            
            # Cursor at 0
            evs = log.after(0)
            self.assertEqual(len(evs), 2)
            
            # Cursor at 1
            evs2 = log.after(1)
            self.assertEqual(len(evs2), 1)
            self.assertEqual(evs2[0]["event"], "result")
            
            # Cursor at 2 (up to date)
            evs3 = log.after(2)
            self.assertEqual(len(evs3), 0)

if __name__ == "__main__":
    unittest.main()
