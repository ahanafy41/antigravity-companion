"""MCP owner mutation regression checks with isolated configuration files."""

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from mcp_settings import MCPSettings  # noqa: E402
from storage import StorageConflict  # noqa: E402


class OwnerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.home = Path(self.folder.name)
        self.cwd = self.home / "project"
        self.global_file = self.home / ".gemini/config/mcp_config.json"
        self.local_file = self.cwd / ".agents/mcp_config.json"
        for path in (self.global_file, self.local_file):
            path.parent.mkdir(parents=True)
            path.write_text(
                json.dumps(
                    {
                        "unknown": 42,
                        "mcpServers": {
                            "same": {
                                "serverUrl": "https://example.invalid/mcp",
                                "headers": {"Authorization": "private"},
                            },
                            "other": {"command": "fixture"},
                        },
                    }
                )
            )
        self.settings = MCPSettings(self.home)

    def tearDown(self):
        self.folder.cleanup()

    def test_workspace_owner_changes_without_touching_global(self):
        original = self.global_file.read_bytes()
        rows = self.settings.listing(self.cwd)
        row = next(row for row in rows if row["name"] == "same")
        self.assertEqual(row["scope"], "workspace")
        self.assertNotIn("private", json.dumps(rows))
        self.settings.change_server(
            "same", self.cwd, "disable", row["revision"]
        )
        self.assertEqual(self.global_file.read_bytes(), original)
        saved = json.loads(self.local_file.read_text())
        self.assertTrue(saved["mcpServers"]["same"]["disabled"])
        self.assertEqual(saved["unknown"], 42)
        self.assertEqual(
            saved["mcpServers"]["same"]["headers"]["Authorization"], "private"
        )
        row = next(
            row
            for row in self.settings.listing(self.cwd)
            if row["name"] == "same"
        )
        self.settings.change_server(
            "same", self.cwd, "delete", row["revision"]
        )
        self.assertEqual(self.global_file.read_bytes(), original)
        self.assertNotIn(
            "same", json.loads(self.local_file.read_text())["mcpServers"]
        )
        self.assertEqual(
            next(
                row
                for row in self.settings.listing(self.cwd)
                if row["name"] == "same"
            )["scope"],
            "global",
        )

    def test_stale_revision_and_missing_target_preserve_files(self):
        row = self.settings.listing(self.cwd)[0]
        self.local_file.write_text(self.local_file.read_text() + " ")
        before = self.local_file.read_bytes()
        with self.assertRaises(StorageConflict):
            self.settings.change_server(
                row["name"], self.cwd, "enable", row["revision"]
            )
        with self.assertRaises(ValueError):
            self.settings.change_server(
                "missing", self.cwd, "delete", row["revision"]
            )
        self.assertEqual(self.local_file.read_bytes(), before)

    def test_malformed_oauth_cannot_be_overwritten(self):
        document = json.loads(self.local_file.read_text())
        document["mcpServers"]["same"]["oauth"] = "invalid"
        self.local_file.write_text(json.dumps(document))
        before = self.local_file.read_bytes()
        revision = next(
            row
            for row in self.settings.listing(self.cwd)
            if row["name"] == "same"
        )["revision"]
        with self.assertRaises(ValueError):
            self.settings.write_oauth(
                "same", self.cwd, {"client_id": "client"}, revision
            )
        self.assertEqual(self.local_file.read_bytes(), before)

    def test_global_owner_is_used_only_without_workspace_override(self):
        self.local_file.unlink()
        row = next(
            row
            for row in self.settings.listing(self.cwd)
            if row["name"] == "same"
        )
        self.assertEqual(row["scope"], "global")
        self.settings.change_server(
            "same", self.cwd, "disable", row["revision"]
        )
        self.assertTrue(
            json.loads(self.global_file.read_text())["mcpServers"]["same"][
                "disabled"
            ]
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
