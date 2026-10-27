"""Generate a deterministic static-cache revision before packaging."""

import argparse
import hashlib
from pathlib import Path
import re
import sys


def prepare(root, check=False):
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if (
            not path.is_file()
            or path.name == "sw.js"
            or path.name.endswith("tests.cjs")
            or path.suffix == ".map"
        ):
            continue
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    worker = root / "sw.js"
    source = worker.read_text(encoding="utf-8-sig")
    updated, count = re.subn(
        r"const CACHE_NAME = '[^']+';",
        "const CACHE_NAME = 'antigravity-static-"
        + digest.hexdigest()[:24]
        + "';",
        source,
    )
    if count != 1:
        raise ValueError(
            "Service Worker cache declaration is missing or ambiguous"
        )
    if check and updated != source:
        raise ValueError(
            "Static cache revision is stale; prepare the web release"
        )
    if not check and updated != source:
        worker.write_text(updated, encoding="utf-8")
    print(
        "Static cache revision verified"
        if check
        else "Static cache revision prepared"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--web-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "server" / "web",
    )
    parser.add_argument("--check", action="store_true")
    options = parser.parse_args()
    try:
        prepare(options.web_root, options.check)
        return 0
    except (OSError, ValueError) as failure:
        print(str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
