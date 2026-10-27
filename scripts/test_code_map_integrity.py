#!/usr/bin/env python3
"""Automated Integrity Test Suite for CODE_MAP.md.

Verifies:
1. Existence of CODE_MAP.md at repository root.
2. Completeness of all 5 mandatory architectural sections.
3. 100% dynamic indexing of all production files across Android, Server, Web, and Scripts.
4. Completeness and correctness of all 8 Surgical Modification Recipes (Recipes A through H).
5. Accurate documentation of Web Message native bridge (addWebMessageListener, Companion.native.request).
6. Presence of standard verification commands and safety guardrails.
"""

from __future__ import annotations

import pathlib
import re
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CODE_MAP_PATH = REPO_ROOT / "CODE_MAP.md"


class CodeMapIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.exists = CODE_MAP_PATH.is_file()
        if cls.exists:
            cls.content = CODE_MAP_PATH.read_text(encoding="utf-8")
        else:
            cls.content = ""

    def test_01_code_map_file_exists(self) -> None:
        self.assertTrue(
            self.exists,
            f"CODE_MAP.md does not exist at repository root: {CODE_MAP_PATH}",
        )

    def test_02_required_sections_present(self) -> None:
        required_headers = [
            "## 1. System Topology & Cross-Layer Data Flow",
            "## 2. Component Breakdown & Responsibilities",
            "## 3. File-by-File Matrix (Complete Inventory)",
            "## 4. Surgical Modification Playbooks",
            "## 5. Verification & Safety Guardrails",
        ]
        for header in required_headers:
            self.assertIn(
                header,
                self.content,
                f"Missing required section header in CODE_MAP.md: '{header}'",
            )

    def test_03_all_recipes_documented(self) -> None:
        expected_recipes = [
            ("Recipe A", "Backend REST API"),
            ("Recipe B", "Web UI"),
            ("Recipe C", "Android Native Bridge"),
            ("Recipe D", "agy CLI"),
            ("Recipe E", "Termux Diagnostic"),
            ("Recipe F", "OTA Release"),
            ("Recipe G", "Backend Unit Test"),
            ("Recipe H", "MCP Server"),
        ]
        for tag, title in expected_recipes:
            pattern = re.compile(rf"{re.escape(tag)}.*{re.escape(title)}", re.IGNORECASE)
            self.assertTrue(
                pattern.search(self.content),
                f"Missing recipe documentation for '{tag}: {title}' in Section 4",
            )

    def test_04_recipe_structure_and_safety_completeness(self) -> None:
        for tag in ["Recipe A", "Recipe B", "Recipe C", "Recipe D", "Recipe E", "Recipe F", "Recipe G", "Recipe H"]:
            self.assertIn(tag, self.content, f"Recipe {tag} missing")
            recipe_idx = self.content.find(tag)
            recipe_chunk = self.content[recipe_idx: recipe_idx + 2500]
            self.assertIn(
                "Verification Command",
                recipe_chunk,
                f"{tag} missing 'Verification Command' section",
            )

        # Recipe A must enforce sync_android_web.py because it touches server/web/api.js
        recipe_a_idx = self.content.find("Recipe A")
        recipe_a_chunk = self.content[recipe_a_idx: recipe_a_idx + 2500]
        self.assertIn(
            "sync_android_web.py",
            recipe_a_chunk,
            "Recipe A must include sync_android_web.py because it modifies server/web/api.js",
        )

        # Recipe C must accurately document the Web Message listener and action registry
        recipe_c_idx = self.content.find("Recipe C")
        recipe_c_chunk = self.content[recipe_c_idx: recipe_c_idx + 2500]
        self.assertIn(
            "native.js",
            recipe_c_chunk,
            "Recipe C must reference server/web/native.js for dispatching native actions",
        )
        self.assertIn(
            "NativeBridgePolicy",
            recipe_c_chunk,
            "Recipe C must reference NativeBridgePolicy for policy authorization",
        )

    def test_05_all_production_files_indexed(self) -> None:
        # 1. Android Java source files (Dynamic inspection)
        java_dir = REPO_ROOT / "app" / "src" / "main" / "java" / "com" / "antigravity" / "companion"
        if java_dir.is_dir():
            for java_file in java_dir.glob("*.java"):
                self.assertIn(
                    java_file.name,
                    self.content,
                    f"Android file {java_file.name} is missing from CODE_MAP.md",
                )

        # 2. Server Python files (Dynamic inspection)
        server_dir = REPO_ROOT / "server"
        if server_dir.is_dir():
            for py_file in server_dir.glob("*.py"):
                self.assertIn(
                    py_file.name,
                    self.content,
                    f"Server module {py_file.name} is missing from CODE_MAP.md",
                )

        # 3. Web UI assets (Dynamic inspection of all runtime assets in server/web/)
        web_dir = REPO_ROOT / "server" / "web"
        if web_dir.is_dir():
            for web_file in web_dir.iterdir():
                if web_file.is_file() and not web_file.name.startswith("."):
                    self.assertIn(
                        web_file.name,
                        self.content,
                        f"Web runtime asset {web_file.name} is missing from CODE_MAP.md",
                    )

        # 4. Scripts (Dynamic inspection of all executable/tool scripts in scripts/)
        scripts_dir = REPO_ROOT / "scripts"
        if scripts_dir.is_dir():
            for script in scripts_dir.iterdir():
                if script.is_file() and not script.name.startswith("."):
                    self.assertIn(
                        script.name,
                        self.content,
                        f"Script {script.name} is missing from CODE_MAP.md",
                    )

    def test_06_native_bridge_architecture_accuracy(self) -> None:
        # Ensure we do NOT hallucinate @JavascriptInterface; verify WebMessageListener accuracy
        self.assertIn("addWebMessageListener", self.content)
        self.assertIn("CompanionNative", self.content)
        self.assertIn("native.js", self.content)
        self.assertNotIn("@JavascriptInterface", self.content)

    def test_07_verification_guardrails_present(self) -> None:
        guardrail_commands = [
            "sync_android_web.py",
            "phase1_preflight.py",
            "test_code_map_integrity.py",
        ]
        for cmd in guardrail_commands:
            self.assertIn(
                cmd,
                self.content,
                f"Missing critical verification command '{cmd}' in Section 5",
            )


if __name__ == "__main__":
    unittest.main()
