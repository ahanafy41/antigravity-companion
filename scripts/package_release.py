"""Create an immutable server bundle and detached signed inventory."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def release_files(root):
    server = root / "server"
    files = list(server.glob("*.py"))
    files += [
        server / "launch_server.sh",
        server / "stop_server.sh",
        server / "release-cert.der",
        server / "version.json",
    ]
    files += [
        path
        for path in (server / "web").rglob("*")
        if path.is_file()
        and not path.name.endswith("tests.cjs")
        and path.suffix not in (".map", ".pyc")
    ]
    inventory = {path.relative_to(server).as_posix(): path for path in files}
    inventory["requirements.txt"] = root / "requirements.txt"
    inventory["install_release.py"] = root / "scripts" / "install_release.py"
    if any(path.is_symlink() for path in inventory.values()):
        raise ValueError("Release sources must not contain symlinks")
    return inventory


def write_bundle(folder, version, inventory):
    archive = folder / ("companion-server-" + version + ".zip")
    with zipfile.ZipFile(
        archive, "x", compression=zipfile.ZIP_DEFLATED
    ) as bundle:
        for name, path in sorted(inventory.items()):
            bundle.write(path, name)
    document = {
        "schema_version": 1,
        "version": version,
        "api_versions": [1],
        "archive_sha256": sha256(archive),
        "files": {
            name: {"size": path.stat().st_size, "sha256": sha256(path)}
            for name, path in sorted(inventory.items())
        },
    }
    manifest = archive.with_suffix(".manifest.json")
    manifest.write_text(
        json.dumps(
            document, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ),
        encoding="utf-8",
    )
    return archive, manifest


def sign_manifest(root, options, manifest):
    java = options.java or shutil.which("java")
    if not java:
        raise ValueError("JDK 17 java is required to sign a release")
    signature = manifest.with_suffix(".sig")
    result = subprocess.run(
        [
            str(java),
            str(root / "scripts" / "ReleaseSigner.java"),
            str(options.keystore),
            str(manifest),
            str(signature),
            str(root / "server" / "release-cert.der"),
        ],
        capture_output=True,
        timeout=60,
        check=False,
    )
    if result.returncode:
        raise ValueError(
            "Release signing failed; verify private signing configuration "
            "and certificate identity"
        )


def package(options):
    root = Path(__file__).resolve().parents[1]
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", options.version)
        or ".." in options.version
    ):
        raise ValueError("Invalid immutable release version")
    identity = json.loads(
        (root / "server" / "version.json").read_text(encoding="utf-8-sig")
    )
    if options.version != identity.get("version_name"):
        raise ValueError("Release version must match server/version.json")
    prepared = subprocess.run(
        [sys.executable, str(root / "scripts" / "prepare_web_release.py")],
        capture_output=True,
        timeout=20,
        check=False,
    )
    if prepared.returncode:
        raise ValueError("Web cache preparation failed")
    options.output.mkdir(parents=True, exist_ok=True)
    final = options.output / options.version
    if final.exists():
        raise ValueError(
            "Release version already exists; use a unique version"
        )
    with tempfile.TemporaryDirectory(
        dir=options.output, prefix=".package-"
    ) as folder:
        staged = Path(folder) / "signed"
        staged.mkdir()
        archive, manifest = write_bundle(
            staged, options.version, release_files(root)
        )
        sign_manifest(root, options, manifest)
        staged.replace(final)
    print("Signed bundle prepared: " + str(final / archive.name))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--keystore", type=Path, default=os.environ.get("SIGNING_KEYSTORE")
    )
    parser.add_argument("--java", type=Path)
    options = parser.parse_args()
    if options.keystore is None:
        parser.error("--keystore or SIGNING_KEYSTORE is required")
    try:
        package(options)
        return 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
