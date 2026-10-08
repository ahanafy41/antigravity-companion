"""Read-only phase-one checks; never authenticates or changes agy."""

import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time

HELP_COMMANDS = {
    "agy": [],
    "mcp_add": ["mcp", "add"],
    "mcp_remove": ["mcp", "remove"],
    "mcp_list": ["mcp", "list"],
    "mcp_enable": ["mcp", "enable"],
    "mcp_disable": ["mcp", "disable"],
    "models": ["models"],
    "agents": ["agents"],
}


def check_result(name, status, detail, elapsed=0, required=True, **evidence):
    return {
        "name": name,
        "status": status,
        "required": required,
        "detail": detail,
        "elapsed_seconds": round(elapsed, 3),
        **evidence,
    }


# Function-size exception: keep subprocess errors beside their status mapping.
# Revisit if another transport needs the same boundary.
def probe_help(name, arguments, timeout):
    """Keep recognized syntax facts; omit CLI diagnostics and paths."""
    started = time.monotonic()
    try:
        completed_help = subprocess.run(
            ["agy", *arguments, "--help"],
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return check_result(name, "unverified", "agy executable unavailable")
    except subprocess.TimeoutExpired:
        return check_result(
            name, "failed", "help probe timed out", time.monotonic() - started
        )
    except OSError:
        return check_result(name, "failed", "help probe could not start")
    elapsed = time.monotonic() - started
    if completed_help.returncode:
        return check_result(
            name,
            "failed",
            "help probe exited unsuccessfully",
            elapsed,
            returncode=completed_help.returncode,
        )
    return parsed_help_contract(
        name,
        arguments,
        completed_help.stdout + "\n" + completed_help.stderr,
        elapsed,
    )


ROOT_FLAGS = set(
    "--input-format --output-format --conversation --continue "
    "--model --agent "
    "--effort --mode --sandbox --project --print-timeout".split()
)
ALLOWED_FLAGS = ROOT_FLAGS | set(
    "--url --transport --scope --env --header --json "
    "--help --version --type".split()
)
ARGUMENT_NAMES = set(
    "name command commandOrUrl args url server server-name id".split()
)


def help_usage(name, arguments, output):
    command = " ".join(arguments) if name != "agents" else "agents?"
    pattern = r"(?im)^\s*usage:\s*agy(?:\.exe)?"
    if name == "agy":
        pattern = r"(?im)^\s*usage(?: of)?\s*:?\s*agy(?:\.exe)?"
    elif command:
        pattern += r"\s+" + (
            command if name == "agents" else re.escape(command)
        )
    return re.search(pattern + r"(?=\s|:|$)([^\r\n]*)", output)


def argument_contract_supported(name, known):
    if name == "mcp_add":
        return "name" in known and any(
            word in known for word in ("command", "commandOrUrl", "url")
        )
    if name in {"mcp_remove", "mcp_enable", "mcp_disable"}:
        return any(
            word in known for word in ("name", "server", "server-name", "id")
        )
    return True


# Function-size exception: one observed help contract yields one report record.
# Revisit if another CLI requires a different parsing grammar.
def parsed_help_contract(name, arguments, output, elapsed):
    output = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", output).lstrip("\ufeff")
    usage = help_usage(name, arguments, output)
    syntax = usage.group(1) if usage else ""
    placeholders = re.findall(r"<([a-zA-Z][a-zA-Z_-]*)(?:\.\.\.)?>", syntax)
    known = [word for word in placeholders if word in ARGUMENT_NAMES]
    flags = sorted(
        set(re.findall(r"(?<!\w)--[a-z][a-z-]*\b", output)) & ALLOWED_FLAGS
    )
    required_flags = {
        "agy": ROOT_FLAGS,
        "mcp_add": {"--type", "--env", "--header"},
    }.get(name, {"--help"})
    missing_flags = sorted(required_flags - set(flags))
    valid = (
        bool(usage)
        and argument_contract_supported(name, known)
        and not missing_flags
    )
    return check_result(
        name,
        "confirmed" if valid else "unverified",
        (
            "command help contract recognized"
            if valid
            else "help contract not recognized"
        ),
        elapsed,
        argument_names=known,
        supported_flags=flags,
        missing_flags=missing_flags,
    )


def check_termux(required):
    prefix = os.environ.get("PREFIX", "").replace("\\", "/").rstrip("/")
    executable = sys.executable.replace("\\", "/")
    android_prefix = bool(
        re.fullmatch(r"/data/(?:data|user/\d+)/com\.termux/files/usr", prefix)
    )
    confirmed = (
        sys.platform in {"android", "linux"}
        and android_prefix
        and executable.startswith(prefix + "/")
    )
    return check_result(
        "termux",
        "confirmed" if confirmed else "unverified",
        (
            "Android runtime evidence present"
            if confirmed
            else "phone runtime not verified"
        ),
        required=required,
        platform=sys.platform,
    )


# Function-size exception: the HTTP resource lifecycle stays with its cleanup.
# Revisit when another readiness probe needs the same HTTP fixture.
async def probe_aiohttp(timeout):
    """Exercise aiohttp server and client on an ephemeral loopback port."""
    started = time.monotonic()
    try:
        import aiohttp
        from aiohttp import web
    except ImportError:
        return check_result("aiohttp", "unverified", "aiohttp unavailable")

    async def exchange():
        async def handler(request):
            return web.json_response({"phase": 1})

        application = web.Application()
        application.router.add_get("/probe", handler)
        runner = web.AppRunner(application)
        try:
            await runner.setup()
            site = web.TCPSite(runner, "127.0.0.1", 0)
            await site.start()
            port = runner.addresses[0][1]
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"http://127.0.0.1:{port}/probe"
                ) as response:
                    return (
                        response.status == 200
                        and await response.json() == {"phase": 1}
                    )
        finally:
            await runner.cleanup()

    try:
        passed = await asyncio.wait_for(exchange(), timeout=timeout)
    except (OSError, RuntimeError, asyncio.TimeoutError, aiohttp.ClientError):
        return check_result(
            "aiohttp",
            "failed",
            "loopback HTTP exchange failed",
            time.monotonic() - started,
            version=aiohttp.__version__,
        )
    return check_result(
        "aiohttp",
        "confirmed" if passed else "failed",
        (
            "loopback HTTP exchange verified"
            if passed
            else "unexpected HTTP response"
        ),
        time.monotonic() - started,
        version=aiohttp.__version__,
    )


def save_report(report, path):
    """Replace one selected report atomically after each completed check."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as report_file:
            temporary = Path(report_file.name)
            json.dump(report, report_file, ensure_ascii=False, indent=2)
            report_file.write("\n")
            report_file.flush()
            os.fsync(report_file.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def exit_status(report, strict):
    if strict and any(
        check["required"] and check["status"] != "confirmed"
        for check in report["checks"]
    ):
        return 1
    return int(any(check["status"] == "failed" for check in report["checks"]))


def preflight_arguments(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, help="selected JSON report; parent must exist"
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10,
        help="seconds per check (default: 10)",
    )
    parser.add_argument(
        "--require-termux",
        action="store_true",
        help="require phone runtime evidence",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="fail if any acceptance evidence remains unresolved",
    )
    args = parser.parse_args(argv)
    if not 0 < args.timeout <= 60:
        parser.error("--timeout must be greater than 0 and no more than 60")
    return args


def environment_checks(args):
    yield check_termux(args.require_termux or args.strict)
    yield asyncio.run(probe_aiohttp(args.timeout))
    for name, command in HELP_COMMANDS.items():
        yield probe_help(name, command, args.timeout)
    for name in (
        "phone_stream_multiturn",
        "phone_cancellation",
        "phone_permissions",
        "phone_data_backup",
        "phone_apk_signature",
        "phone_termux_result",
    ):
        yield check_result(
            name, "unverified", "requires witnessed phone acceptance test"
        )


# Function-size exception: report assembly owns persistence and errors.
# Revisit when another report consumer needs shared orchestration.
def main(argv=None):
    args = preflight_arguments(argv)
    report = {
        "schema_version": 1,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "checks": [],
        "blocking_checks": [],
    }

    def record(check):
        report["checks"].append(check)
        report["blocking_checks"] = [
            completed_check["name"]
            for completed_check in report["checks"]
            if completed_check["required"]
            and completed_check["status"] != "confirmed"
        ]
        if args.output:
            save_report(report, args.output)
        if check["status"] == "failed":
            print(f"{check['name']}: failed", file=sys.stderr)
        elif args.output:
            print(f"{check['name']}: {check['status']}")

    try:
        for completed_check in environment_checks(args):
            record(completed_check)
    except (OSError, ValueError) as error:
        print(f"report/check failure: {type(error).__name__}", file=sys.stderr)
        return 2
    if not args.output:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return exit_status(report, args.strict)


if __name__ == "__main__":
    raise SystemExit(main())
