"""Run the single-owner local Antigravity Companion API."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sys
import threading
import time

from aiohttp import web
from application import create_app


def port_number(text):
    port = int(text)
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1024 and 65535")
    return port


@contextmanager
def server_lock(root):
    root.mkdir(parents=True, exist_ok=True)
    with (root / "server.lock").open("a+b") as stream:
        stream.seek(0)
        if os.name == "nt":
            import msvcrt

            if not stream.read(1):
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def configured_port(root):
    try:
        settings = json.loads(
            (root / "settings.json").read_text(encoding="utf-8-sig")
        )
    except FileNotFoundError:
        return 7681
    if not isinstance(settings, dict):
        raise ValueError("Stored settings must be an object")
    return port_number(str(settings.get("port", 7681)))


def bootstrap_configuration():
    raw = sys.stdin.buffer.read(1024 * 1024 + 1)
    if not raw or not raw.strip():
        return {}
    if len(raw) > 1024 * 1024:
        raise ValueError("Android bootstrap exceeds the input limit")
    configuration = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(configuration, dict):
        raise ValueError("Android bootstrap must be an object")
    return configuration


def request_shutdown():
    def hard_exit():
        time.sleep(0.15)
        os._exit(0)

    thread = threading.Thread(target=hard_exit, daemon=True)
    thread.start()
    raise web.GracefulExit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=["127.0.0.1"], default="127.0.0.1")
    parser.add_argument("--port", type=port_number)
    parser.add_argument(
        "--data-dir", type=Path, default=Path.home() / ".antigravity-server"
    )
    parser.add_argument("--android-token-stdin", action="store_true")
    options = parser.parse_args()
    try:
        options.port = options.port or configured_port(options.data_dir)
        with server_lock(options.data_dir):
            pid_file = options.data_dir / "server.pid"
            pid_file.write_text(str(os.getpid()), encoding="utf-8")
            try:
                app = create_app(options.data_dir, options.port)
                app["shutdown_callback"] = request_shutdown
                if options.android_token_stdin:
                    cfg = bootstrap_configuration()
                    if cfg:
                        app["android"].configure(cfg)
                print(
                    "Local URL: http://127.0.0.1:" + str(options.port), flush=True
                )
                web.run_app(
                    app,
                    host="127.0.0.1",
                    port=options.port,
                    access_log=None,
                    print=None,
                )
            finally:
                pid_file.unlink(missing_ok=True)
        os._exit(0)
    except (OSError, ValueError, UnicodeError) as failure:
        print("Server could not start: " + str(failure), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
