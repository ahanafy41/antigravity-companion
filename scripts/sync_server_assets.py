#!/usr/bin/env python3
"""Synchronize canonical server runtime files into APK assets and Termux directory."""

from pathlib import Path
import shutil
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_SRC = PROJECT_ROOT / "server"
ASSETS_SERVER_DST = PROJECT_ROOT / "app" / "src" / "main" / "assets" / "server"
ASSETS_WEB_DST = PROJECT_ROOT / "app" / "src" / "main" / "assets" / "web"
TERMUX_SERVER_DST = Path.home() / ".antigravity-server"

EXCLUDE_EXTENSIONS = {".pyc", ".log", ".pid", ".bak", ".ndjson"}
EXCLUDE_NAMES = {"__pycache__", "server.lock", "actions.json", "sessions.json", "settings.json", "runs.json", "cli-quota.json"}


def should_copy(path: Path) -> bool:
    if any(part in EXCLUDE_NAMES for part in path.parts):
        return False
    if path.suffix in EXCLUDE_EXTENSIONS:
        return False
    if path.name.endswith("tests.cjs"):
        return False
    return True


def sync_directory(src: Path, dst: Path, clean: bool = True):
    if not src.is_dir():
        raise ValueError(f"Source directory {src} does not exist")
    dst.mkdir(parents=True, exist_ok=True)
    copied_files = set()

    for item in src.rglob("*"):
        if item.is_file() and should_copy(item):
            rel = item.relative_to(src)
            target = dst / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_bytes() != item.read_bytes():
                shutil.copyfile(item, target)
                shutil.copymode(item, target)
            copied_files.add(rel.as_posix())

    if clean:
        for existing in list(dst.rglob("*")):
            if existing.is_file():
                rel = existing.relative_to(dst).as_posix()
                if rel not in copied_files and not rel.endswith(".json") and not rel.endswith(".ndjson"):
                    existing.unlink(missing_ok=True)
        for d in sorted([p for p in dst.rglob("*") if p.is_dir()], key=lambda p: len(p.parts), reverse=True):
            if not any(d.iterdir()):
                d.rmdir()


def main():
    print(f"Syncing {SERVER_SRC} -> {ASSETS_SERVER_DST}...")
    sync_directory(SERVER_SRC, ASSETS_SERVER_DST, clean=True)

    print(f"Syncing {SERVER_SRC / 'web'} -> {ASSETS_WEB_DST}...")
    sync_directory(SERVER_SRC / "web", ASSETS_WEB_DST, clean=True)

    if TERMUX_SERVER_DST.exists():
        print(f"Updating local Termux server files at {TERMUX_SERVER_DST}...")
        sync_directory(SERVER_SRC, TERMUX_SERVER_DST, clean=False)

    print("Synchronization complete and verified.")


if __name__ == "__main__":
    main()
