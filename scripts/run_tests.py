"""Manual phase-one acceptance tests; run with python scripts/run_tests.py."""

import argparse
import asyncio
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import phase1_preflight as preflight


class PreflightTests(unittest.TestCase):
    def test_help_contract_requires_specific_command_evidence(self):
        cases = [
            ("Usage: agy mcp add <name> <command> [args...]", "unverified"),
            ("Usage: agy mcp add [options]", "unverified"),
            ("Usage: agy mcp remove <name>", "unverified"),
        ]
        for output, expected in cases:
            with self.subTest(output=output):
                result = subprocess.CompletedProcess([], 0, output, "")
                with patch("subprocess.run", return_value=result):
                    check = preflight.probe_help("mcp_add", ["mcp", "add"], 1)
                self.assertEqual(check["status"], expected)
                self.assertNotIn(output, json.dumps(check))

    def test_actual_cli_help_and_missing_required_flag_regression(self):
        flags = (
            "--input-format --output-format --conversation --continue "
            "--model --agent "
            "--effort --mode --sandbox --project --print-timeout"
        )
        cases = [
            ("agy", [], "Usage of agy.exe:\n" + flags, "confirmed"),
            (
                "agy",
                [],
                "Usage of agy.exe:\n" + flags.replace("--sandbox", ""),
                "unverified",
            ),
            (
                "mcp_add",
                ["mcp", "add"],
                "Usage: agy.exe mcp add [flags] <name> "
                "<commandOrUrl> [args...]\n--type --env --header",
                "confirmed",
            ),
            (
                "mcp_add",
                ["mcp", "add"],
                "Usage: agy.exe mcp add [flags] <name> "
                "<commandOrUrl> [args...]\n--env --header",
                "unverified",
            ),
            (
                "agents",
                ["agents"],
                "Usage: agy.exe agent [flags]\n--help",
                "confirmed",
            ),
            (
                "models",
                ["models"],
                "Usage: agy.exe models [flags]\n--help",
                "confirmed",
            ),
        ]
        for name, command, output, expected in cases:
            with self.subTest(name=name, output=output):
                response = subprocess.CompletedProcess([], 0, output, "")
                with patch("subprocess.run", return_value=response):
                    result = preflight.probe_help(name, command, 1)
                self.assertEqual(result["status"], expected)

    def test_successful_help_on_stderr_confirms_contract(self):
        response = subprocess.CompletedProcess(
            [], 0, "", "Usage: agy.exe models [flags]\n--help"
        )
        with patch("subprocess.run", return_value=response):
            self.assertEqual(
                preflight.probe_help("models", ["models"], 1)["status"],
                "confirmed",
            )

    def test_cli_failures_never_leak_diagnostics(self):
        cases = [
            (FileNotFoundError("private/path"), "unverified"),
            (subprocess.TimeoutExpired("secret", 1), "failed"),
            (
                subprocess.CompletedProcess([], 2, "token=secret", "secret"),
                "failed",
            ),
        ]
        for response, expected in cases:
            with self.subTest(response=type(response).__name__):
                args = (
                    {"side_effect": response}
                    if isinstance(response, Exception)
                    else {"return_value": response}
                )
                with patch("subprocess.run", **args):
                    check = preflight.probe_help("mcp_add", ["mcp", "add"], 1)
                self.assertEqual(check["status"], expected)
                self.assertNotIn("secret", json.dumps(check))

    def test_termux_requires_android_and_matching_runtime_evidence(self):
        cases = [
            (
                "win32",
                "/data/data/com.termux/files/usr",
                "C:/python.exe",
                "unverified",
            ),
            (
                "linux",
                "/data/data/com.termux/files/usr",
                "/usr/bin/python",
                "unverified",
            ),
            (
                "linux",
                "/data/user/0/com.termux/files/usr",
                "/data/user/0/com.termux/files/usr/bin/python",
                "confirmed",
            ),
            ("android", "", "/system/bin/python", "unverified"),
        ]
        for platform, prefix, executable, expected in cases:
            with self.subTest(platform=platform, executable=executable):
                with patch.object(
                    preflight.sys, "platform", platform
                ), patch.object(
                    preflight.sys, "executable", executable
                ), patch.dict(
                    preflight.os.environ, {"PREFIX": prefix}, clear=True
                ):
                    self.assertEqual(
                        preflight.check_termux(True)["status"], expected
                    )

    def test_report_atomically_replaces_bom_file_and_strict_rejects_pending(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text("\ufeff{}", encoding="utf-8")
            report = {
                "schema_version": 1,
                "checks": [{"required": True, "status": "unverified"}],
            }
            preflight.save_report(report, path)
            self.assertEqual(
                json.loads(path.read_text(encoding="utf-8-sig")), report
            )
            self.assertEqual(list(Path(directory).iterdir()), [path])
            self.assertEqual(preflight.exit_status(report, strict=True), 1)
            self.assertEqual(preflight.exit_status(report, strict=False), 0)

    def test_cli_failures_use_stderr_when_report_is_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "report.json"
            stdout_capture = io.StringIO()
            stderr_capture = io.StringIO()
            failed_command = subprocess.CompletedProcess([], 2, "", "")
            with (
                redirect_stdout(stdout_capture),
                redirect_stderr(stderr_capture),
                patch("subprocess.run", return_value=failed_command),
            ):
                exit_code = preflight.main(["--output", str(report_path)])
            self.assertEqual(exit_code, 1)
            self.assertNotIn(": failed", stdout_capture.getvalue())
            self.assertIn("agy: failed", stderr_capture.getvalue())
            saved_report = json.loads(report_path.read_text(encoding="utf-8"))
            agy_check = next(
                check
                for check in saved_report["checks"]
                if check["name"] == "agy"
            )
            self.assertEqual(agy_check["status"], "failed")

    def test_aiohttp_probe_completes_real_loopback_request(self):
        result = asyncio.run(preflight.probe_aiohttp(3))
        if result["status"] == "unverified":
            self.skipTest("aiohttp unavailable")
        self.assertEqual(result["status"], "confirmed", result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    unittest.main(argv=[__file__], verbosity=2)
