import unittest
import tempfile
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from conversation_metadata import ConversationMetadataStore

class TestConversationMetadata(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "metadata.json"
        self.store = ConversationMetadataStore(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_empty_metadata(self):
        data = self.store.get_all()
        self.assertEqual(data, {})

    def test_set_and_get_title(self):
        self.store.update("conv-1", title="مشروع الرفيق")
        entry = self.store.get("conv-1")
        self.assertEqual(entry["title"], "مشروع الرفيق")
        self.assertFalse(entry.get("is_pinned", False))

    def test_pin_conversation(self):
        self.store.update("conv-2", is_pinned=True)
        entry = self.store.get("conv-2")
        self.assertTrue(entry["is_pinned"])
        self.assertIsNotNone(entry.get("pinned_at"))

    def test_unpin_conversation(self):
        self.store.update("conv-2", is_pinned=True)
        self.store.update("conv-2", is_pinned=False)
        entry = self.store.get("conv-2")
        self.assertFalse(entry["is_pinned"])

    def test_delete_conversation(self):
        self.store.update("conv-3", title="تجربة")
        self.store.mark_deleted("conv-3")
        self.assertTrue(self.store.is_deleted("conv-3"))
        all_meta = self.store.get_all()
        self.assertTrue(all_meta["conv-3"].get("is_deleted", False))

if __name__ == "__main__":
    unittest.main()
