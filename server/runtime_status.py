"""Local runtime measurements without account or environment disclosure."""

import asyncio
import os
import re
import shutil
import sys
import time
from datetime import datetime

from cli_client import CLIUnavailable


def parse_quota_report(text):
    """Accept the legacy four-column report; unknown layouts fail closed."""
    quotas = []
    groups = {
        "gemini models": "Gemini Models",
        "claude and gpt models": "Claude and GPT models",
    }
    limits = {"Five Hour Limit Remaining", "Weekly Limit Remaining"}
    for line in text.lstrip("\ufeff").splitlines():
        line = line.strip()
        if not line or line.startswith("Quota:"):
            continue
        columns = re.split(r"\t+|\s{2,}", line)
        if (
            len(columns) != 4
            or columns[0].casefold() not in groups
            or columns[1] not in limits
        ):
            raise CLIUnavailable("Quota report format is not verified")
        if not re.fullmatch(r"(?:100|[0-9]{1,2})%", columns[2]):
            raise CLIUnavailable("Quota percentage is invalid")
        try:
            reset = datetime.fromisoformat(columns[3].replace("Z", "+00:00"))
        except ValueError as failure:
            raise CLIUnavailable(
                "Quota reset timestamp is invalid"
            ) from failure
        if reset.tzinfo is None:
            raise CLIUnavailable("Quota reset timestamp needs a timezone")
        quotas.append(
            {
                "group": groups[columns[0].casefold()],
                "limit_type": columns[1],
                "remaining_percent": int(columns[2][:-1]),
                "reset_time": reset.isoformat(),
            }
        )
    if not quotas:
        raise CLIUnavailable("No verified quota records returned")
    return quotas


class CLIAdministration:
    def __init__(self, cli, store):
        self.cli = cli
        self.store = store
        self.update_reserved = False
        self.updates = store.read("cli-administration").get("updates", {})
        recovered = False
        for outcome in self.updates.values():
            if outcome["status"] == "running":
                outcome["status"] = "outcome_unknown"
                recovered = True
        if recovered:
            self.save_updates()

    @property
    def updating(self):
        return self.update_reserved or any(
            outcome["status"] == "running" for outcome in self.updates.values()
        )

    def save_updates(self):
        document = self.store.read("cli-administration")
        document["updates"] = self.updates
        self.store.write("cli-administration", document)

    async def quota(self, refresh=False):
        cached = self.store.read("cli-quota")
        report = {
            "source": "agy --print /usage",
            "quotas": cached.get("quotas", []),
            "fetched_at": cached.get("fetched_at"),
            "stale": True,
            "error": None,
        }
        if refresh:
            try:
                quotas = parse_quota_report(
                    await self.cli.command(["-p", "/usage"])
                )
                cached.update(quotas=quotas, fetched_at=time.time())
                self.store.write("cli-quota", cached)
                report.update(
                    quotas=quotas, fetched_at=cached["fetched_at"], stale=False
                )
            except (CLIUnavailable, OSError):
                report["error"] = "Account quota could not be verified"
        elif report["fetched_at"] is not None:
            report["stale"] = time.time() - report["fetched_at"] > 300
        return report

    async def version(self):
        output = (await self.cli.command(["--version"])).strip()
        number = r"(?:0|[1-9][0-9]*)"
        prerelease = r"(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
        semver = (
            number
            + r"\."
            + number
            + r"\."
            + number
            + r"(?:-"
            + prerelease
            + r"(?:\."
            + prerelease
            + r")*)?"
            + r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
        )
        return output if re.fullmatch(semver, output) else None

    async def update(self, request_id, can_update):
        if not isinstance(request_id, str) or not re.fullmatch(
            r"[\w.-]{1,128}", request_id
        ):
            raise ValueError("A valid update request_id is required")
        async with self.cli.mutation_lock:
            if request_id in self.updates:
                return dict(self.updates[request_id])
            if not can_update():
                raise ValueError("Close owned CLI sessions before updating")
            self.update_reserved = True
            try:
                return await self.perform_update(request_id, can_update)
            finally:
                self.update_reserved = False

    async def perform_update(self, request_id, can_update):
        before = await self.version()
        if before is None:
            raise CLIUnavailable("Installed CLI version cannot be verified")
        help_text = await self.cli.command(["--help"])
        if not re.search(r"^\s*update\s+", help_text, re.MULTILINE):
            raise CLIUnavailable("CLI update command is not advertised")
        await self.cli.command(["update", "--help"])
        if not can_update():
            raise ValueError("Close owned CLI sessions before updating")
        if len(self.updates) >= 128:
            raise ValueError("Update request ledger is full")
        outcome = {
            "request_id": request_id,
            "status": "running",
            "version_before": before,
            "version_after": None,
        }
        self.updates[request_id] = outcome
        self.save_updates()
        try:
            await self.cli.command(["update"], timeout=60)
            after = await self.version()
            outcome.update(
                version_after=after,
                status=(
                    "completed"
                    if after and after != before
                    else "unchanged" if after else "outcome_unknown"
                ),
            )
        except (CLIUnavailable, OSError):
            outcome["status"] = "outcome_unknown"
        except asyncio.CancelledError:
            outcome["status"] = "outcome_unknown"
            self.save_updates()
            raise
        self.save_updates()
        return dict(outcome)


def system_usage(root):
    disk = shutil.disk_usage(root)
    cpu = os.times()
    return {
        "disk": {
            "total_bytes": disk.total,
            "used_bytes": disk.used,
            "free_bytes": disk.free,
        },
        "cpu": {"user_seconds": cpu.user, "system_seconds": cpu.system},
        "memory": {"max_rss_bytes": maximum_resident_bytes()},
    }


def maximum_resident_bytes():
    try:
        import resource
    except ImportError:
        return None
    measured = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return measured if sys.platform == "darwin" else measured * 1024
