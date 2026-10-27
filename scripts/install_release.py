"""Verify a signed offline bundle and atomically select a local release."""

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

CERTIFICATE_SHA256 = (
    "348bf2a7af8f14e5ec2d0528a703bd1645049d6b1205e1f6cc7b6530f9435ddb"
)
MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def safe_member(name):
    path = PurePosixPath(name)
    if (
        not name
        or "\\" in name
        or ":" in name
        or path.is_absolute()
        or any(part in ("..", ".") for part in name.split("/"))
    ):
        raise ValueError("Unsafe archive member")
    return path


def read_object(path):
    document = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(document, dict):
        raise ValueError("Expected a JSON object")
    return document


def atomic_json(path, document):
    descriptor, staged = tempfile.mkstemp(dir=path.parent, prefix=".pointer-")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(staged, path)
    finally:
        Path(staged).unlink(missing_ok=True)


def activate(root, pointer):
    current = root / "current.json"
    if current.exists():
        atomic_json(root / "previous.json", read_object(current))
    atomic_json(current, pointer)


@contextmanager
def installation_lock(root):
    lock = root / ".install.lock"
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as failure:
        raise ValueError(
            (
                "Installation is locked; inspect the interrupted install "
                "before removing its lock"
            )
        ) from failure
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(str(os.getpid()))
        yield
    finally:
        lock.unlink(missing_ok=True)


def verify_signature(manifest, signature, certificate, expected):
    if digest(certificate) != expected.lower():
        raise ValueError("Release certificate fingerprint mismatch")
    openssl = shutil.which("openssl")
    if not openssl:
        raise ValueError(
            "OpenSSL is required for release signature verification"
        )
    with tempfile.TemporaryDirectory(prefix="companion-verify-") as folder:
        public_key = Path(folder) / "public.pem"
        extraction = subprocess.run(
            [
                openssl,
                "x509",
                "-inform",
                "DER",
                "-in",
                str(certificate),
                "-pubkey",
                "-noout",
            ],
            capture_output=True,
            check=False,
            timeout=15,
        )
        if extraction.returncode:
            raise ValueError("Cannot read the release certificate")
        public_key.write_bytes(extraction.stdout)
        verification = subprocess.run(
            [
                openssl,
                "dgst",
                "-sha256",
                "-verify",
                str(public_key),
                "-signature",
                str(signature),
                str(manifest),
            ],
            capture_output=True,
            check=False,
            timeout=15,
        )
        if verification.returncode:
            raise ValueError("Release manifest signature is invalid")


def extract_verified(archive, destination, manifest):
    expected = manifest.get("files")
    if not isinstance(expected, dict) or not 1 <= len(expected) <= 512:
        raise ValueError("Invalid release file inventory")
    with zipfile.ZipFile(archive) as bundle:
        members = bundle.infolist()
        names = [member.filename for member in members]
        if len(set(names)) != len(names) or set(names) != set(expected):
            raise ValueError(
                "Archive inventory does not match its signed manifest"
            )
        if sum(member.file_size for member in members) > MAX_TOTAL:
            raise ValueError("Release exceeds the unpacked size limit")
        for member in members:
            extract_member(
                bundle, member, destination, expected[member.filename]
            )


def extract_member(bundle, member, destination, specification):
    relative = safe_member(member.filename)
    mode = member.external_attr >> 16
    if member.is_dir() or (mode & 0o170000) == 0o120000:
        raise ValueError("Directory and symlink entries are forbidden")
    if not isinstance(specification, dict) or member.file_size > MAX_FILE:
        raise ValueError("Invalid release member")
    if member.file_size != specification.get("size"):
        raise ValueError("Release member size mismatch")
    target = destination.joinpath(*relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    with bundle.open(member) as source, target.open("xb") as stream:
        shutil.copyfileobj(source, stream, length=1024 * 1024)
    if digest(target) != specification.get("sha256"):
        raise ValueError("Release member checksum mismatch")


def check_runtime(release):
    result = subprocess.run(
        [sys.executable, "-B", str(release / "server.py"), "--help"],
        capture_output=True,
        timeout=20,
        check=False,
    )
    if result.returncode:
        raise ValueError(
            (
                "Release runtime check failed; install declared requirements "
                "before activation"
            )
        )


def verify_installed(release, manifest):
    inventory = set(manifest["files"]) | {".manifest.json", ".manifest.sig"}
    actual = set()
    for path in release.rglob("*"):
        if path.is_symlink():
            raise ValueError("Installed release contains a symlink")
        if path.is_file():
            actual.add(path.relative_to(release).as_posix())
    if actual != inventory:
        raise ValueError("Installed release inventory has changed")
    for name, specification in manifest["files"].items():
        path = release.joinpath(*safe_member(name).parts)
        if path.is_symlink() or digest(path) != specification["sha256"]:
            raise ValueError("Installed release has changed")
    check_runtime(release)


def install_launchers(root, release):
    for name in (
        "launch_server.sh",
        "stop_server.sh",
        "launcher.py",
        "install_release.py",
        "release-cert.der",
    ):
        target = root / name
        if (
            target.exists()
            and not target.with_suffix(target.suffix + ".legacy.bak").exists()
        ):
            shutil.copy2(
                target, target.with_suffix(target.suffix + ".legacy.bak")
            )
        descriptor, staged = tempfile.mkstemp(dir=root, prefix=".launcher-")
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write((release / name).read_bytes())
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(staged, 0o700)
            os.replace(staged, target)
        finally:
            Path(staged).unlink(missing_ok=True)


def copy_limited(source, target, maximum):
    copied = 0
    with source.open("rb") as original, target.open("xb") as snapshot:
        while chunk := original.read(min(1024 * 1024, maximum - copied + 1)):
            copied += len(chunk)
            if copied > maximum:
                raise ValueError("Release input exceeds its size limit")
            snapshot.write(chunk)
        snapshot.flush()
        os.fsync(snapshot.fileno())


def snapshot_inputs(options, folder):
    frozen = argparse.Namespace(**vars(options))
    for field, limit in (
        ("manifest", 256 * 1024),
        ("signature", 8192),
        ("certificate", 64 * 1024),
        ("archive", MAX_TOTAL),
    ):
        path = folder / field
        copy_limited(getattr(options, field), path, limit)
        setattr(frozen, field, path)
    return frozen


def install(options):
    private = options.root / ".tmp"
    private.mkdir(mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=private, prefix="verify-") as folder:
        frozen = snapshot_inputs(options, Path(folder))
        install_snapshot(frozen)


def install_snapshot(options):
    verify_signature(
        options.manifest,
        options.signature,
        options.certificate,
        options.certificate_sha256,
    )
    manifest = read_object(options.manifest)
    version = manifest.get("version", "")
    if (
        not isinstance(version, str)
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", version)
        or ".." in version
        or manifest.get("api_versions") != [1]
    ):
        raise ValueError("Unsupported release version or API contract")
    if digest(options.archive) != manifest.get("archive_sha256"):
        raise ValueError("Release archive checksum mismatch")
    releases = options.root / "releases"
    releases.mkdir(parents=True, exist_ok=True)
    final = releases / version
    if final.exists():
        raise ValueError(
            "Release version already exists; use a unique immutable version"
        )
    with tempfile.TemporaryDirectory(
        dir=releases, prefix=".install-"
    ) as folder:
        staged = Path(folder) / "content"
        staged.mkdir()
        extract_verified(options.archive, staged, manifest)
        check_runtime(staged)
        shutil.copy2(options.manifest, staged / ".manifest.json")
        shutil.copy2(options.signature, staged / ".manifest.sig")
        staged.replace(final)
    install_launchers(options.root, final)
    activate(
        options.root,
        {"version": version, "manifest_sha256": digest(options.manifest)},
    )


def verify_selected(options):
    pointer = read_object(options.root / "current.json")
    version = pointer.get("version", "")
    if (
        not isinstance(version, str)
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", version)
        or ".." in version
    ):
        raise ValueError("Invalid selected release pointer")
    release = options.root / "releases" / version
    manifest = release / ".manifest.json"
    if digest(manifest) != pointer.get("manifest_sha256"):
        raise ValueError("Selected manifest has changed")
    verify_signature(
        manifest,
        release / ".manifest.sig",
        options.certificate,
        options.certificate_sha256,
    )
    verify_installed(release, read_object(manifest))


def rollback(options):
    pointer = read_object(options.root / "previous.json")
    version = pointer.get("version", "")
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", version)
        or ".." in version
    ):
        raise ValueError("Invalid previous release pointer")
    release = options.root / "releases" / version
    manifest_path = release / ".manifest.json"
    if digest(manifest_path) != pointer["manifest_sha256"]:
        raise ValueError("Previous release pointer was altered")
    verify_signature(
        manifest_path,
        release / ".manifest.sig",
        options.certificate,
        options.certificate_sha256,
    )
    verify_installed(release, read_object(manifest_path))
    install_launchers(options.root, release)
    activate(options.root, pointer)


def default_certificate():
    adjacent = Path(__file__).resolve().with_name("release-cert.der")
    if adjacent.exists():
        return adjacent
    return Path(__file__).resolve().parents[1] / "server" / "release-cert.der"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--signature", type=Path)
    parser.add_argument(
        "--certificate",
        type=Path,
        default=default_certificate(),
    )
    parser.add_argument("--certificate-sha256", default=CERTIFICATE_SHA256)
    parser.add_argument(
        "--root", type=Path, default=Path.home() / ".antigravity-server"
    )
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--rollback", action="store_true")
    action.add_argument("--verify-selected", action="store_true")
    options = parser.parse_args()
    if (
        not options.rollback
        and not options.verify_selected
        and any(
            getattr(options, field) is None
            for field in ("archive", "manifest", "signature")
        )
    ):
        parser.error("--archive, --manifest and --signature are required")
    try:
        options.root = options.root.expanduser().resolve()
        if options.verify_selected:
            verify_selected(options)
            print("Selected release signature and inventory verified")
            return 0
        options.root.mkdir(parents=True, exist_ok=True)
        with installation_lock(options.root):
            rollback(options) if options.rollback else install(options)
        print(
            (
                "Release selected. Restart the owned server to activate it; "
                "local data is unchanged."
            )
        )
        return 0
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        zipfile.BadZipFile,
        subprocess.TimeoutExpired,
    ) as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
