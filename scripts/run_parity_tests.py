"""Targeted local tests for CLI settings ownership and workspace discovery."""

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from aiohttp import ClientSession, CookieJar, web

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from storage import StorageConflict  # noqa: E402


class PolicyHTTPTests(unittest.IsolatedAsyncioTestCase):
    async def test_policy_requires_pairing_and_csrf_and_preserves_owner(self):
        from application import create_app

        with tempfile.TemporaryDirectory() as directory:
            with patch.object(Path, "home", return_value=Path(directory)):
                app = create_app(Path(directory) / "data", 0)
            runner = web.AppRunner(app)
            await runner.setup()
            site = web.TCPSite(runner, "127.0.0.1", 0)
            await site.start()
            app["port"] = site._server.sockets[0].getsockname()[1]
            url = f'http://127.0.0.1:{app["port"]}/api/v1'
            try:
                async with ClientSession(
                    cookie_jar=CookieJar(unsafe=True)
                ) as client:
                    response = await client.get(url + "/cli/policy")
                    self.assertEqual(response.status, 401)
                    response = await client.post(
                        url + "/pair", json={"code": app["pairing"].code}
                    )
                    csrf = (await response.json())["csrf_token"]
                    response = await client.get(url + "/cli/policy")
                    self.assertEqual(response.status, 200)
                    view = await response.json()
                    self.assertEqual(view["owner"], "agy")
                    payload = {
                        "permissions": {"deny": ["shell(*)"]},
                        "revision": view["revision"],
                    }
                    response = await client.patch(
                        url + "/cli/policy", json=payload
                    )
                    self.assertEqual(response.status, 403)
                    response = await client.patch(
                        url + "/cli/policy",
                        json=payload,
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(response.status, 200)
                    saved = await response.json()
                    self.assertEqual(
                        saved["permissions"]["deny"], ["shell(*)"]
                    )
                    self.assertNotEqual(saved["revision"], view["revision"])
            finally:
                await runner.cleanup()


class CatalogTests(unittest.TestCase):
    def test_linked_workspace_skill_root_does_not_escape(self):
        from cli_catalog import local_catalog, toggle_skill

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside" / "skills" / "linked"
            outside.mkdir(parents=True)
            (outside / "SKILL.md").write_text("fixture", encoding="utf-8")
            workspace = root / "project"
            workspace.mkdir()
            try:
                os.symlink(root / "outside", workspace / ".agents",
                           target_is_directory=True)
            except OSError:
                self.skipTest("Directory symlinks are unavailable")
            with patch.object(Path, "home", return_value=root):
                self.assertEqual(local_catalog("skills", workspace), [])
                with self.assertRaises(FileNotFoundError):
                    toggle_skill("linked", "disable", workspace)
            self.assertTrue((outside / "SKILL.md").exists())

    def test_duplicate_skill_names_are_read_only(self):
        from cli_catalog import local_catalog, toggle_skill

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "project"
            for skill in (
                root / ".gemini/antigravity-cli/skills/shared",
                workspace / ".agents/skills/shared",
            ):
                skill.mkdir(parents=True)
                (skill / "SKILL.md").write_text("fixture", encoding="utf-8")
            with patch.object(Path, "home", return_value=root):
                self.assertFalse(
                    local_catalog("skills", workspace)[0]["mutable"]
                )
                with self.assertRaises(ValueError):
                    toggle_skill("shared", "disable", workspace)

    def test_workspace_skill_is_discovered_and_toggle_is_reversible(self):
        from cli_catalog import local_catalog, toggle_skill

        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / "project"
            skill = workspace / ".agents" / "skills" / "local-skill"
            skill.mkdir(parents=True)
            original = b"---\nname: local-skill\n---\nPrivate instructions"
            (skill / "SKILL.md").write_bytes(original)
            with patch.object(Path, "home", return_value=Path(directory)):
                entries = local_catalog("skills", workspace)
                self.assertEqual(entries[0]["id"], "local-skill")
                toggle_skill("local-skill", "disable", workspace)
                self.assertFalse((skill / "SKILL.md").exists())
                self.assertFalse(
                    local_catalog("skills", workspace)[0]["enabled"]
                )
                toggle_skill("local-skill", "enable", workspace)
                self.assertEqual((skill / "SKILL.md").read_bytes(), original)

    def test_unknown_and_plugin_skill_cannot_be_renamed(self):
        from cli_catalog import toggle_skill

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            skill = (
                root
                / ".gemini"
                / "antigravity-cli"
                / "plugins"
                / "a-plugin"
                / "skills"
                / "bundled"
            )
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text("plugin", encoding="utf-8")
            with patch.object(Path, "home", return_value=root):
                with self.assertRaises(PermissionError):
                    toggle_skill("bundled", "disable")
                with self.assertRaises(ValueError):
                    toggle_skill("../bundled", "disable")
                with self.assertRaises(FileNotFoundError):
                    toggle_skill("missing", "disable")
            self.assertTrue((skill / "SKILL.md").exists())


class PolicyTests(unittest.TestCase):
    def test_policy_edits_preserve_private_and_unknown_fields(self):
        from cli_settings import CLISettings

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            original = {
                "api_key": "private-fixture",
                "future": {"keep": True},
                "permissions": {"custom": 7, "deny": ["shell(rm *)"]},
            }
            path.write_text(json.dumps(original), encoding="utf-8-sig")
            owner = CLISettings(path)
            view = owner.read_policy()
            self.assertNotIn("private-fixture", json.dumps(view))
            result = owner.write_policy(
                {"allow": ["read_file(*)"]}, view["revision"]
            )
            document = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(document["api_key"], "private-fixture")
            self.assertEqual(document["future"], original["future"])
            self.assertEqual(document["permissions"]["custom"], 7)
            self.assertEqual(document["permissions"]["deny"], ["shell(rm *)"])
            self.assertEqual(result["permissions"]["allow"], ["read_file(*)"])

    def test_external_edit_conflicts_without_overwriting(self):
        from cli_settings import CLISettings

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            owner = CLISettings(path)
            revision = owner.read_policy()["revision"]
            path.write_text('{"external":true}', encoding="utf-8")
            with self.assertRaises(StorageConflict):
                owner.write_policy({"deny": ["shell(*)"]}, revision)
            self.assertEqual(path.read_text(), '{"external":true}')

    def test_invalid_policy_does_not_create_settings(self):
        from cli_settings import CLISettings

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            owner = CLISettings(path)
            for policy in (
                {"autopilot": True},
                {"allow": "*"},
                {"deny": ["shell(*)\x00"]},
            ):
                with self.assertRaises(ValueError):
                    owner.write_policy(policy, owner.read_policy()["revision"])
            self.assertFalse(path.exists())

    def test_competing_writer_lock_is_not_removed(self):
        from cli_settings import CLISettings

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            owner = CLISettings(path)
            lock = path.with_name("settings.json.companion-lock")
            lock.write_text("other", encoding="utf-8")
            with self.assertRaises(StorageConflict):
                owner.write_policy(
                    {"allow": []}, owner.read_policy()["revision"]
                )
            self.assertEqual(lock.read_text(), "other")


if __name__ == "__main__":
    unittest.main()
