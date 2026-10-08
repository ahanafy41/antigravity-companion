"""Exercise the actual server entry, pairing and single-owner process lock."""

import json
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

SERVER = Path(__file__).resolve().parents[1] / "server" / "server.py"
spec = importlib.util.spec_from_file_location(
    "launcher", SERVER.with_name("launcher.py")
)
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


class LauncherTests(unittest.TestCase):
    def test_actual_entry_respects_port_identity_assets_and_owner_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            port = free_port()
            (root / "settings.json").write_text(
                json.dumps({"port": port, "unknown": 42})
            )
            environment = dict(os.environ, USERPROFILE=folder, HOME=folder)
            process = subprocess.Popen(
                [sys.executable, "-B", str(SERVER), "--data-dir", folder],
                env=environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                url = "http://127.0.0.1:" + str(port)
                deadline = time.monotonic() + 10
                while True:
                    try:
                        with urllib.request.urlopen(
                            url + "/health", timeout=1
                        ) as response:
                            health = json.load(response)
                        break
                    except (OSError, urllib.error.URLError):
                        if time.monotonic() >= deadline:
                            self.fail("Server did not become ready")
                        time.sleep(0.05)
                self.assertEqual(health["service"], "antigravity-companion")
                self.assertEqual(health["api_versions"], [1])
                with urllib.request.urlopen(url + "/api.js") as response:
                    self.assertIn(b"X-CSRF-Token", response.read())
                    self.assertIn(
                        "script-src 'self'",
                        response.headers["Content-Security-Policy"],
                    )
                second = subprocess.run(
                    [sys.executable, "-B", str(SERVER), "--data-dir", folder],
                    env=environment,
                    capture_output=True,
                    timeout=10,
                )
                self.assertNotEqual(second.returncode, 0)
                self.assertIn(b"could not start", second.stderr)
                self.assertEqual(
                    json.loads((root / "settings.json").read_text())[
                        "unknown"
                    ],
                    42,
                )
            finally:
                process.terminate()
                process.communicate(timeout=10)

    def test_remote_binding_is_rejected_before_server_creation(self):
        result = subprocess.run(
            [sys.executable, "-B", str(SERVER), "--host", "0.0.0.0"],
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"invalid choice", result.stderr)

    def test_existing_server_bootstrap_requires_matching_local_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "instance.json").write_text('{"instance_id":"owned"}')
            (root / "android.json").write_text('{"unknown":42}')
            bootstrap = json.dumps(
                {"android_token": "a" * 43, "android_port": 8765}
            ).encode()
            with self.assertRaises(ValueError):
                launcher.publish_bootstrap(
                    root, bootstrap, {"instance_id": "foreign"}
                )
            self.assertEqual(
                json.loads((root / "android.json").read_text()),
                {"unknown": 42},
            )
            launcher.publish_bootstrap(
                root, bootstrap, {"instance_id": "owned"}
            )
            saved = json.loads((root / "android.json").read_text())
            self.assertEqual(saved["unknown"], 42)
            self.assertEqual(saved["android_token"], "a" * 43)


if __name__ == "__main__":
    unittest.main(verbosity=2)
