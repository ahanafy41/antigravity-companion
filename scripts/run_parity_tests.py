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


class CLIContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_plugin_json_metadata_and_empty_catalog_are_accepted(self):
        from cli_client import CLI, CLIUnavailable, parse_listing
        from unittest.mock import AsyncMock

        entry = {"name": "bundle", "enabled": False, "skills": ["review"]}
        self.assertEqual(
            parse_listing(json.dumps([entry]), "plugins"),
            [dict(entry, id="bundle")],
        )
        cli = CLI()
        cli.executable = sys.executable
        cli.command = AsyncMock(return_value="[]")
        self.assertEqual(await cli.listing("plugins"), [])
        cli.command.assert_awaited_once_with(["plugin", "list", "--json"])
        self.assertEqual(
            cli.command.call_args.args[0], ["plugin", "list", "--json"]
        )
        cli.command.return_value = '{"unknown": []}'
        with self.assertRaises(CLIUnavailable):
            await cli.listing("plugins")

    async def test_version_uses_explicit_command_and_strict_semver(self):
        from runtime_status import CLIAdministration
        from unittest.mock import AsyncMock
        from types import SimpleNamespace

        for value, expected in (
            ("1.3.5\n", "1.3.5"),
            ("1.3.5-rc.1+build.2", "1.3.5-rc.1+build.2"),
            ("01.3.5", None),
            ("1.3.5-01", None),
            ("Antigravity CLI 1.3.5", None),
        ):
            cli = SimpleNamespace(command=AsyncMock(return_value=value))
            admin = object.__new__(CLIAdministration)
            admin.cli = cli
            self.assertEqual(await admin.version(), expected)
            self.assertEqual(cli.command.call_args.args[0], ["--version"])

    def test_spinner_preserves_first_model_and_tab_columns(self):
        from cli_client import parse_listing

        for separator in ("\t", "  "):
            output = (
                "⠋ Fetching available models...⠙ Fetching available models..."
                "gemini-3.8-flash-high" + separator + "Gemini High\n"
                "gemini-3.8-flash-medium" + separator + "Gemini Medium"
            )
            self.assertEqual(
                parse_listing(output, "models"),
                [
                    {"id": "gemini-3.8-flash-high", "name": "Gemini High"},
                    {"id": "gemini-3.8-flash-medium", "name": "Gemini Medium"},
                ],
            )

    def test_slash_catalog_includes_enabled_skills_from_plugin_json(self):
        from cli_catalog import local_catalog

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "workspace"
            plugin = root / "plugin"
            for folder in (
                workspace / ".agents/skills/local-review",
                workspace / ".agents/skills/disabled",
                plugin / "skills/bundled-review",
                plugin / "skills/not-advertised",
            ):
                folder.mkdir(parents=True)
                filename = (
                    "SKILL.md.disabled"
                    if folder.name == "disabled"
                    else "SKILL.md"
                )
                (folder / filename).write_text("fixture", encoding="utf-8")
            hidden = workspace / ".agents/skills/hidden"
            hidden.mkdir(parents=True)
            (hidden / "SKILL.md").write_text(
                "---\ndisable-slash-command: true\n---\nprivate",
                encoding="utf-8",
            )
            plugins = [
                {
                    "name": "bundle",
                    "path": str(plugin),
                    "enabled": True,
                    "skills": ["bundled-review", "../../hidden"],
                }
            ]
            with patch.object(Path, "home", return_value=root):
                entries = local_catalog("commands", workspace, plugins)
                self.assertEqual(
                    {x["id"] for x in entries},
                    {"/local-review", "/bundled-review"},
                )
                plugins[0]["enabled"] = False
                self.assertEqual(
                    {
                        x["id"]
                        for x in local_catalog("commands", workspace, plugins)
                    },
                    {"/local-review"},
                )


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
                os.symlink(
                    root / "outside",
                    workspace / ".agents",
                    target_is_directory=True,
                )
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
