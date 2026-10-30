import unittest
import tempfile
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from legacy_conversations import LegacyConversations
from conversation_metadata import ConversationMetadataStore

class TestLegacyConversationsTools(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.legacy = LegacyConversations(self.root)
        self.meta_store = ConversationMetadataStore(self.root / "meta.json")

    def tearDown(self):
        self.tmp.cleanup()

    def test_listing_with_metadata_and_pinning(self):
        # Create 2 mock conversations
        for cid, mtime in [("cid-1", 1000), ("cid-2", 2000)]:
            t_dir = self.root / ".gemini" / "antigravity-cli" / "brain" / cid / ".system_generated" / "logs"
            t_dir.mkdir(parents=True, exist_ok=True)
            t_file = t_dir / "transcript.jsonl"
            t_file.write_text(json.dumps({
                "type": "USER_INPUT",
                "content": f"<USER_REQUEST>محادثة {cid}</USER_REQUEST>"
            }) + "\n", encoding="utf-8")

        # Pin cid-1 (even though cid-2 is newer)
        self.meta_store.update("cid-1", title="المشروع الأساسي", is_pinned=True)

        items = self.legacy.listing(metadata_store=self.meta_store)
        self.assertEqual(len(items), 2)
        # Pinned item should be first
        self.assertEqual(items[0]["conversation_id"], "cid-1")
        self.assertEqual(items[0]["title"], "المشروع الأساسي")
        self.assertTrue(items[0]["is_pinned"])

    def test_transcript_extracts_tools(self):
        cid = "cid-tools"
        t_dir = self.root / ".gemini" / "antigravity-cli" / "brain" / cid / ".system_generated" / "logs"
        t_dir.mkdir(parents=True, exist_ok=True)
        t_file = t_dir / "transcript.jsonl"

        lines = [
            json.dumps({"type": "USER_INPUT", "content": "افحص الملفات"}),
            json.dumps({
                "type": "PLANNER_RESPONSE",
                "thinking": "فحص سريع",
                "content": "",
                "tool_calls": [
                    {"name": "run_command", "args": {"CommandLine": "ls -la", "toolSummary": "List files"}}
                ]
            }),
            json.dumps({"type": "GENERIC", "content": "total 12\nfile1.txt\nfile2.txt"})
        ]
        t_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

        res = self.legacy.transcript(cid)
        messages = res.get("messages", [])
        self.assertEqual(len(messages), 2) # 1 user, 1 agent
        agent_msg = messages[1]
        self.assertEqual(agent_msg["role"], "agent")
        self.assertTrue(len(agent_msg.get("tools", [])) > 0)
        tool = agent_msg["tools"][0]
        self.assertEqual(tool["name"], "run_command")
        self.assertEqual(tool["summary"], "List files")

if __name__ == "__main__":
    unittest.main()
