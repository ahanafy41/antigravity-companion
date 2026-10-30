import unittest
import tempfile
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from legacy_conversations import LegacyConversations
from conversation_metadata import ConversationMetadataStore

class TestConversationResilienceAndManagement(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.legacy = LegacyConversations(self.root)
        self.meta_store = ConversationMetadataStore(self.root / "meta.json")

    def tearDown(self):
        self.tmp.cleanup()

    def test_pinning_and_renaming_lifecycle(self):
        # Create 3 mock conversations
        cids = ["conv-alpha", "conv-beta", "conv-gamma"]
        for cid in cids:
            t_dir = self.root / ".gemini" / "antigravity-cli" / "brain" / cid / ".system_generated" / "logs"
            t_dir.mkdir(parents=True, exist_ok=True)
            (t_dir / "transcript.jsonl").write_text(json.dumps({
                "type": "USER_INPUT",
                "content": f"<USER_REQUEST>طلب {cid}</USER_REQUEST>"
            }) + "\n", encoding="utf-8")

        # Initial listing
        items = self.legacy.listing(metadata_store=self.meta_store)
        self.assertEqual(len(items), 3)

        # 1. Rename conv-alpha
        self.meta_store.update("conv-alpha", title="مشروع المراجعة")
        items_renamed = self.legacy.listing(metadata_store=self.meta_store)
        item_alpha = next(x for x in items_renamed if x["conversation_id"] == "conv-alpha")
        self.assertEqual(item_alpha["title"], "مشروع المراجعة")

        # 2. Pin conv-gamma (should jump to top)
        self.meta_store.update("conv-gamma", is_pinned=True)
        items_pinned = self.legacy.listing(metadata_store=self.meta_store)
        self.assertEqual(items_pinned[0]["conversation_id"], "conv-gamma")
        self.assertTrue(items_pinned[0]["is_pinned"])

        # 3. Soft delete conv-beta
        self.meta_store.mark_deleted("conv-beta")
        items_deleted = self.legacy.listing(metadata_store=self.meta_store)
        self.assertEqual(len(items_deleted), 2)
        self.assertNotIn("conv-beta", [x["conversation_id"] for x in items_deleted])

    def test_tool_telemetry_with_multiple_tools_and_outputs(self):
        cid = "conv-multi-tools"
        t_dir = self.root / ".gemini" / "antigravity-cli" / "brain" / cid / ".system_generated" / "logs"
        t_dir.mkdir(parents=True, exist_ok=True)

        lines = [
            json.dumps({"type": "USER_INPUT", "source": "USER_EXPLICIT", "content": "صلح المشكلة وافحص الكود"}),
            json.dumps({
                "type": "PLANNER_RESPONSE",
                "thinking": "تحليل أولي",
                "content": "",
                "tool_calls": [
                    {"name": "read_file", "args": {"Path": "/app/code.py", "toolSummary": "Read code"}},
                    {"name": "run_command", "args": {"CommandLine": "git diff", "toolSummary": "Check diff"}}
                ]
            }),
            json.dumps({"type": "GENERIC", "content": "diff --git a/app/code.py b/app/code.py"})
        ]
        (t_dir / "transcript.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")

        transcript = self.legacy.transcript(cid)
        messages = transcript["messages"]
        self.assertEqual(len(messages), 2)

        agent_msg = messages[1]
        self.assertEqual(agent_msg["role"], "agent")
        self.assertEqual(len(agent_msg["tools"]), 2)
        self.assertEqual(agent_msg["tools"][0]["name"], "read_file")
        self.assertEqual(agent_msg["tools"][1]["name"], "run_command")
        self.assertIn("diff", agent_msg["tools"][1]["preview"])
        self.assertEqual(agent_msg.get("terminal_status"), "completed_tools")

if __name__ == "__main__":
    unittest.main()
