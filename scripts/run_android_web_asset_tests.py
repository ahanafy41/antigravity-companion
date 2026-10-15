"""Check Android offline assets and optionally inspect a built APK."""

import argparse
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = Path(__file__).with_name("sync_android_web.py")


def run_sync(*arguments):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *map(str, arguments)],
        capture_output=True,
        text=True,
        timeout=30,
    )


class AndroidWebAssetTests(unittest.TestCase):
    def test_runtime_bytes_are_mirrored_without_test_or_cache_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "source"
            destination = root / "assets" / "web"
            source.mkdir()
            (source / "vendor").mkdir()
            (source / "__pycache__").mkdir()
            runtime = {
                "index.html": b"\xef\xbb\xbf<html>offline</html>\r\n",
                "start.html": b"start\x00",
                "vendor/runtime.js": b"runtime\r\n",
            }
            for name, content in runtime.items():
                (source / name).write_bytes(content)
            (source / "run_tests.cjs").write_bytes(b"test")
            (source / "__pycache__" / "compiled.pyc").write_bytes(b"cache")
            destination.parent.mkdir()
            repair = destination.parent / "repair.html"
            repair.write_bytes(b"preserve")
            completed = run_sync(
                "--source", source, "--destination", destination
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(
                {
                    path.relative_to(destination).as_posix(): path.read_bytes()
                    for path in destination.rglob("*")
                    if path.is_file()
                },
                runtime,
            )
            self.assertEqual(repair.read_bytes(), b"preserve")
            checked = run_sync(
                "--source", source, "--destination", destination, "--check"
            )
            self.assertEqual(checked.returncode, 0, checked.stderr)
            (destination / "start.html").write_bytes(b"stale")
            checked = run_sync(
                "--source", source, "--destination", destination, "--check"
            )
            self.assertNotEqual(checked.returncode, 0)
            self.assertIn("start.html", checked.stderr)

    def test_apk_verification_rejects_missing_corrupt_and_test_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "source"
            source.mkdir()
            (source / "start.html").write_bytes(b"offline")
            apk = root / "application.apk"
            for variant in ("valid", "missing", "corrupt", "test"):
                with self.subTest(variant=variant):
                    with zipfile.ZipFile(apk, "w") as archive:
                        archive.writestr(
                            "assets/server/web/start.html", b"offline"
                        )
                        if variant != "missing":
                            archive.writestr(
                                "assets/web/start.html",
                                (
                                    b"stale"
                                    if variant == "corrupt"
                                    else b"offline"
                                ),
                            )
                        if variant == "test":
                            archive.writestr(
                                "assets/web/run_tests.cjs", b"test"
                            )
                    checked = run_sync("--source", source, "--apk", apk)
                    self.assertEqual(
                        checked.returncode == 0,
                        variant == "valid",
                        checked.stderr,
                    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, help="Also verify a built APK")
    options = parser.parse_args()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(
        AndroidWebAssetTests
    )
    outcome = unittest.TextTestRunner(verbosity=2).run(suite)
    if not outcome.wasSuccessful():
        return 1
    arguments = ["--check"]
    if options.apk:
        arguments.extend(["--apk", options.apk])
    checked = run_sync(*arguments)
    print(checked.stdout, end="")
    print(checked.stderr, end="", file=sys.stderr)
    return checked.returncode


if __name__ == "__main__":
    raise SystemExit(main())
