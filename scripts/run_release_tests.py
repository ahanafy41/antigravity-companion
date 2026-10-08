"""Focused offline installation checks using temporary local files."""

import hashlib
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
import zipfile

SCRIPT = Path(__file__).with_name("install_release.py")
spec = importlib.util.spec_from_file_location("installer", SCRIPT)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ReleaseTests(unittest.TestCase):
    def test_release_shell_uses_unix_line_endings(self):
        package_path = SCRIPT.with_name("package_release.py")
        package_spec = importlib.util.spec_from_file_location(
            "package_release", package_path
        )
        package = importlib.util.module_from_spec(package_spec)
        package_spec.loader.exec_module(package)
        project = SCRIPT.parent.parent
        with tempfile.TemporaryDirectory() as folder:
            archive, _ = package.write_bundle(
                Path(folder), "shell-proof", package.release_files(project)
            )
            with zipfile.ZipFile(archive) as bundle:
                shell = bundle.read("launch_server.sh")
            self.assertTrue(shell.startswith(b"#!/usr/bin/env bash\n"))
            self.assertNotIn(b"\r", shell)
        self.assertNotIn(b"\r", (project / "setup.sh").read_bytes())

    def test_mislabeled_release_is_rejected_before_output_creation(self):
        project = SCRIPT.parent.parent
        identity = json.loads(
            (project / "server" / "version.json").read_text(encoding="utf-8")
        )
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / "output"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT.with_name("package_release.py")),
                    "--version", identity["version_name"] + "-mismatch",
                    "--output", str(destination),
                    "--keystore", str(Path(folder) / "unused.jks"),
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertNotEqual(completed.returncode, 0)
            self.assertIn("must match server/version.json", completed.stderr)
            self.assertFalse(destination.exists())

    def test_untrusted_paths_and_links_are_rejected(self):
        for path in ("../escape", "/absolute", "a\\b", "C:drive", "x/../bad"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                installer.safe_member(path)

    def test_corruption_and_extra_files_never_activate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / "bundle.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("server.py", "bad")
            manifest = {
                "files": {
                    "server.py": {
                        "sha256": hashlib.sha256(b"good").hexdigest(),
                        "size": 4,
                    }
                }
            }
            destination = root / "release"
            destination.mkdir()
            with self.assertRaises(ValueError):
                installer.extract_verified(archive, destination, manifest)
            self.assertFalse((root / "current.json").exists())

    def test_atomic_pointer_retains_unknown_settings_and_previous(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data").mkdir()
            settings = root / "data" / "settings.json"
            settings.write_text('{"unknown":42}', encoding="utf-8")
            installer.activate(root, {"version": "old"})
            installer.activate(root, {"version": "new"})
            self.assertEqual(
                json.loads((root / "previous.json").read_text())["version"],
                "old",
            )
            self.assertEqual(json.loads(settings.read_text())["unknown"], 42)

    def test_unsigned_extra_file_is_rejected_before_rollback_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "server.py").write_text("print('should not run')")
            (root / "evil.py").write_text("untrusted")
            (root / ".manifest.json").write_text("{}")
            (root / ".manifest.sig").write_bytes(b"signature")
            manifest = {
                "files": {
                    "server.py": {
                        "sha256": installer.digest(root / "server.py")
                    }
                }
            }
            with self.assertRaisesRegex(ValueError, "inventory"):
                installer.verify_installed(root, manifest)

    def test_signing_failure_leaves_no_immutable_release(self):
        identity = json.loads(
            (SCRIPT.parent.parent / "server" / "version.json").read_text(
                encoding="utf-8"
            )
        )
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT.with_name("package_release.py")),
                    "--version",
                    identity["version_name"],
                    "--output",
                    str(root),
                    "--java",
                    sys.executable,
                    "--keystore",
                    str(root / "missing"),
                ],
                capture_output=True,
                timeout=30,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b"Release signing failed", result.stderr)
            self.assertEqual(list(root.iterdir()), [])

    def test_replacing_downloads_does_not_change_captured_release_inputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = {}
            for field in ("manifest", "signature", "certificate", "archive"):
                paths[field] = root / field
                paths[field].write_bytes(field.encode())
            private = root / "private"
            private.mkdir()
            frozen = installer.snapshot_inputs(
                argparse.Namespace(**paths), private
            )
            for path in paths.values():
                path.write_bytes(b"replacement")
            for field in paths:
                self.assertEqual(
                    getattr(frozen, field).read_bytes(), field.encode()
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
