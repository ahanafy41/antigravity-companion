"""Launch the selected local release without killing other servers."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def healthy(port):
    try:
        with urllib.request.urlopen(
            "http://127.0.0.1:" + str(port) + "/health", timeout=1
        ) as response:
            health = json.load(response)
        if health.get("service") == "antigravity-companion" and health.get(
            "api_versions"
        ) == [1]:
            return health
        return None
    except (OSError, ValueError, urllib.error.URLError):
        return False


def selected_release(root):
    pointer = json.loads(
        (root / "current.json").read_text(encoding="utf-8-sig")
    )
    version = pointer.get("version", "")
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", version)
        or ".." in version
    ):
        raise ValueError("Invalid release pointer")
    release = root / "releases" / version
    manifest_path = release / ".manifest.json"
    if (
        hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        != pointer["manifest_sha256"]
    ):
        raise ValueError("Release pointer and manifest disagree")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    expected = set(manifest["files"]) | {".manifest.json", ".manifest.sig"}
    actual = set()
    for path in release.rglob("*"):
        if path.is_symlink():
            raise ValueError("Selected release contains a symlink")
        if path.is_file():
            actual.add(path.relative_to(release).as_posix())
    if actual != expected:
        raise ValueError("Selected release inventory has changed")
    for name, specification in manifest["files"].items():
        path = release / name
        if (
            path.is_symlink()
            or release.resolve() not in path.resolve().parents
        ):
            raise ValueError("Release file escapes its directory")
        with path.open("rb") as stream:
            if (
                hashlib.file_digest(stream, "sha256").hexdigest()
                != specification["sha256"]
            ):
                raise ValueError("Selected release has changed")
    return release


def publish_bootstrap(root, payload, health):
    instance = json.loads(
        (root / "instance.json").read_text(encoding="utf-8-sig")
    )
    expected = instance.get("instance_id", "")
    supplied = health.get("instance_id", "")
    if (
        not isinstance(expected, str)
        or not expected
        or not isinstance(supplied, str)
        or not secrets.compare_digest(expected, supplied)
    ):
        raise ValueError("Ready server does not own the configured local data")
    configuration = json.loads(payload.decode("utf-8-sig"))
    token = configuration.get("android_token")
    if (
        not isinstance(token, str)
        or not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token)
        or configuration.get("android_port") != 8765
    ):
        raise ValueError("Invalid private Android bootstrap")
    target = root / "android.json"
    try:
        current = json.loads(target.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        current = {}
    if not isinstance(current, dict):
        raise ValueError("Private Android configuration must be an object")
    current.update(android_token=token, android_port=8765)
    descriptor, staged = tempfile.mkstemp(dir=root, prefix=".android-")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(current, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(staged, 0o600)
        os.replace(staged, target)
    finally:
        Path(staged).unlink(missing_ok=True)


def verify_selection(root):
    result = subprocess.run(
        [
            sys.executable,
            "-B",
            str(root / "install_release.py"),
            "--verify-selected",
            "--root",
            str(root),
            "--certificate",
            str(root / "release-cert.der"),
        ],
        capture_output=True,
        timeout=30,
        check=False,
    )
    if result.returncode:
        raise ValueError("Selected local release verification failed")


def start(root, port, bootstrap):
    health = healthy(port)
    if health:
        if bootstrap is not None:
            publish_bootstrap(root, bootstrap, health)
        print("Local Companion API is already ready")
        return
    verify_selection(root)
    release = selected_release(root)
    arguments = [
        sys.executable,
        "-B",
        str(release / "server.py"),
        "--data-dir",
        str(root),
        "--port",
        str(port),
    ]
    if bootstrap is not None:
        arguments.append("--android-token-stdin")
    temporary = root / ".tmp"
    temporary.mkdir(exist_ok=True)
    descriptor, output = tempfile.mkstemp(dir=temporary, prefix="launch-")
    try:
        with os.fdopen(descriptor, "wb") as stream:
            process = subprocess.Popen(
                arguments,
                stdin=subprocess.PIPE,
                stdout=stream,
                stderr=stream,
                start_new_session=os.name == "posix",
            )
        process.stdin.write(bootstrap or b"")
        process.stdin.close()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise ValueError(
                    (
                        "Companion exited during startup; "
                        "run server.py directly "
                        "to inspect errors"
                    )
                )
            if healthy(port):
                print(
                    Path(output).read_text(encoding="utf-8", errors="replace")[
                        :4096
                    ]
                )
                print("Local Companion API is ready")
                return
            time.sleep(0.25)
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        raise ValueError("Local Companion API did not become ready")
    finally:
        try:
            Path(output).unlink(missing_ok=True)
        except PermissionError:
            print(
                "Startup diagnostics retained under .tmp until server exit",
                file=sys.stderr,
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path.home() / ".antigravity-server"
    )
    parser.add_argument("--port", type=int)
    parser.add_argument("--android-token-stdin", action="store_true")
    options = parser.parse_args()
    try:
        if options.port is None:
            try:
                settings = json.loads(
                    (options.root / "settings.json").read_text(
                        encoding="utf-8-sig"
                    )
                )
            except FileNotFoundError:
                settings = {}
            options.port = int(settings.get("port", 7681))
        if not 1024 <= options.port <= 65535:
            raise ValueError("Invalid server port")
        bootstrap = (
            sys.stdin.buffer.read(1024 * 1024 + 1)
            if options.android_token_stdin
            else None
        )
        if bootstrap is not None and len(bootstrap) > 1024 * 1024:
            raise ValueError("Bootstrap input is too large")
        start(options.root.expanduser().resolve(), options.port, bootstrap)
        print(f"COMPANION_SERVER_PORT={options.port}")
        return 0
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        subprocess.TimeoutExpired,
    ) as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
