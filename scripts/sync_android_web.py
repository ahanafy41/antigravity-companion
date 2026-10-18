"""Mirror canonical runtime web bytes and verify offline Android assets."""

import argparse
from pathlib import Path
import shutil
import sys
import zipfile

PROJECT = Path(__file__).resolve().parents[1]


def is_runtime(relative):
    return (
        "__pycache__" not in relative.parts
        and relative.suffix != ".pyc"
        and not relative.name.endswith("tests.cjs")
    )


def runtime_files(source):
    if not source.is_dir():
        raise ValueError("Canonical web source directory is missing")
    files = {
        path.relative_to(source): path
        for path in sorted(source.rglob("*"))
        if path.is_file() and is_runtime(path.relative_to(source))
    }
    if not files:
        raise ValueError("Canonical web source directory is empty")
    return files


def validate_sync_paths(source, destination):
    src_res = Path(source).resolve()
    dst_res = Path(destination).resolve()
    if src_res == dst_res:
        raise ValueError("Source and destination must be distinct paths")
    if src_res in dst_res.parents or dst_res in src_res.parents:
        raise ValueError("Source and destination must not overlap or contain each other")


def sync_files(files, destination, source_root=None):
    dst_res = Path(destination).resolve()
    if source_root is not None:
        validate_sync_paths(source_root, destination)
    else:
        for src in files.values():
            s_res = src.resolve()
            for s_par in [s_res, *s_res.parents]:
                if s_par == dst_res or dst_res in s_par.parents or s_par in dst_res.parents:
                    raise ValueError("Source and destination must not overlap or contain each other")
    expected_relatives = set(files.keys())
    source_canonical = {src.resolve() for src in files.values()}
    for relative, source in files.items():
        target = destination / relative
        if target.is_symlink() or target.exists():
            target_resolved = target.resolve()
            if target_resolved in source_canonical or (target_resolved != target and dst_res not in target_resolved.parents):
                raise ValueError("Target path resolves outside destination or into source")
            if target.is_symlink():
                target.unlink()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    if destination.is_dir():
        for existing in list(destination.rglob("*")):
            if existing.is_file() or existing.is_symlink():
                if existing.resolve() in source_canonical:
                    continue
                rel = existing.relative_to(destination)
                if rel not in expected_relatives:
                    existing.unlink()
        for d in sorted([p for p in destination.rglob("*") if p.is_dir()], key=lambda p: len(p.parts), reverse=True):
            if not any(d.iterdir()):
                d.rmdir()


def verify_directory(files, destination):
    for relative, source in files.items():
        target = destination / relative
        if not target.is_file() or target.read_bytes() != source.read_bytes():
            raise ValueError(
                "Offline web asset is missing or stale: " + str(relative)
            )
    for target in destination.rglob("*"):
        if target.is_file():
            rel = target.relative_to(destination)
            if not is_runtime(rel) or rel not in files:
                raise ValueError(
                    "Unexpected or obsolete asset in offline web tree: " + str(target)
                )


def verify_apk(files, apk):
    with zipfile.ZipFile(apk) as archive:
        names = set(archive.namelist())
        for prefix in ("assets/web/", "assets/server/web/"):
            for relative, source in files.items():
                name = prefix + relative.as_posix()
                if (
                    name not in names
                    or archive.read(name) != source.read_bytes()
                ):
                    raise ValueError(
                        "APK web asset is missing or stale: " + name
                    )
            for name in names:
                if name.startswith(prefix) and not name.endswith("/"):
                    rel = Path(name.removeprefix(prefix))
                    if not is_runtime(rel) or rel not in files:
                        raise ValueError("Unexpected or obsolete asset in APK: " + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, default=PROJECT / "server" / "web"
    )
    parser.add_argument(
        "--destination",
        type=Path,
        default=PROJECT / "app" / "src" / "main" / "assets" / "web",
    )
    parser.add_argument(
        "--check", action="store_true", help="Verify without copying"
    )
    parser.add_argument(
        "--apk", type=Path, help="Verify both web trees in an APK"
    )
    options = parser.parse_args()
    try:
        validate_sync_paths(options.source, options.destination)
        files = runtime_files(options.source)
        if options.apk:
            verify_apk(files, options.apk)
        if options.check:
            verify_directory(files, options.destination)
        elif not options.apk:
            sync_files(files, options.destination, source_root=options.source)
            verify_directory(files, options.destination)
        print("Android runtime web assets verified: " + str(len(files)))
        return 0
    except (OSError, ValueError, zipfile.BadZipFile) as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
