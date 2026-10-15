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


def sync_files(files, destination):
    for relative, source in files.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)


def verify_directory(files, destination):
    for relative, source in files.items():
        target = destination / relative
        if not target.is_file() or target.read_bytes() != source.read_bytes():
            raise ValueError(
                "Offline web asset is missing or stale: " + str(relative)
            )
    for target in destination.rglob("*"):
        if target.is_file() and not is_runtime(
            target.relative_to(destination)
        ):
            raise ValueError(
                "Excluded asset in offline web tree: " + str(target)
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
                    if not is_runtime(Path(name.removeprefix(prefix))):
                        raise ValueError("Excluded asset in APK: " + name)


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
        files = runtime_files(options.source)
        if options.apk:
            verify_apk(files, options.apk)
        if options.check:
            verify_directory(files, options.destination)
        elif not options.apk:
            sync_files(files, options.destination)
            verify_directory(files, options.destination)
        print("Android runtime web assets verified: " + str(len(files)))
        return 0
    except (OSError, ValueError, zipfile.BadZipFile) as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
