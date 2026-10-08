"""Authenticated Android transport with durable action identities."""

import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import secrets
import re
from aiohttp import ClientError, ClientSession, WSMsgType
from storage import StorageConflict
from cli_client import CLIUnavailable

ACTIONS = {
    "tree",
    "select",
    "click",
    "text",
    "scroll",
    "back",
    "screenshot",
    "home",
    "recents",
    "notifications",
    "launch_app",
    "speak",
    "speech_cancel",
}
READ_ACTIONS = {"tree", "select", "screenshot"}


class AndroidClient:
    def __init__(self, store):
        self.store = store
        self.lock = asyncio.Lock()
        self.configuration = {}
        self.reload_configuration()
        self.actions = store.read("actions").get("actions", {})
        for action in self.actions.values():
            if action["status"] == "running":
                action.update(
                    status="outcome_unknown", error="Server restarted"
                )
        self.persist()

    @property
    def available(self):
        return bool(self.configuration.get("android_token"))

    def configure(self, configuration):
        validate_configuration(configuration)
        token = configuration["android_token"]
        port = configuration["android_port"]
        stored = self.store.read("android")
        stored.update(android_token=token, android_port=port)
        self.store.write("android", stored)
        self.store.path("android").chmod(0o600)
        backup = self.store.root / "android.json.bak"
        if backup.exists():
            backup.chmod(0o600)
        self.configuration = dict(configuration)

    def reload_configuration(self):
        try:
            published = self.store.read("android")
            validate_configuration(published)
        except (OSError, ValueError, UnicodeError):
            self.configuration = {}
            return False
        self.configuration = published
        return True

    def persist(self):
        self.store.write("actions", {"actions": self.actions})

    @asynccontextmanager
    async def journal_connection(self):
        if not self.available:
            raise ValueError("Android authentication is not configured")
        async with ClientSession() as client:
            async with client.ws_connect(
                "ws://127.0.0.1:8765",
                headers={
                    "Authorization": "Bearer "
                    + self.configuration["android_token"]
                },
                timeout=5,
                max_msg_size=1024 * 1024,
            ) as socket:
                packet = await asyncio.wait_for(socket.receive(), 5)
                if packet.type != WSMsgType.TEXT:
                    raise ValueError("Android journal identity unavailable")
                identity = json.loads(packet.data)
                if (
                    not isinstance(identity, dict)
                    or identity.get("type") != "journal_ready"
                    or not re.fullmatch(
                        r"[a-f0-9]{32}", str(identity.get("epoch", ""))
                    )
                ):
                    raise ValueError("Invalid Android journal identity")
                yield socket, identity["epoch"]

    async def journal_identity(self):
        try:
            async with self.journal_connection() as (_, epoch):
                return {"epoch": epoch}
        except (
            ClientError,
            OSError,
            asyncio.TimeoutError,
            ValueError,
        ) as failure:
            raise CLIUnavailable(
                "Android journal identity is unavailable"
            ) from failure

    def retire_completed(self, epoch):
        retired = {
            key: record
            for key, record in self.actions.items()
            if record["status"] in ("completed", "failed")
            and record.get("action") not in READ_ACTIONS
            and re.fullmatch(r"[a-f0-9]{32}:.+", key)
            and not key.startswith(epoch + ":")
        }
        if retired:
            retained = {
                key: record
                for key, record in self.actions.items()
                if key not in retired
            }
            self.store.write("actions", {"actions": retained})
            self.actions = retained

    async def execute(self, request):
        action_id = request.get("action_id")
        action = request.get("action")
        args = request.get("args", {})
        if (
            not isinstance(action_id, str)
            or not re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", action_id)
            or action not in ACTIONS
            or not isinstance(args, dict)
        ):
            raise ValueError("Invalid Android action")
        digest = hashlib.sha256(
            json.dumps(request, sort_keys=True).encode()
        ).hexdigest()
        async with self.lock:
            previous = self.actions.get(action_id)
            if previous:
                if not secrets.compare_digest(previous["fingerprint"], digest):
                    raise StorageConflict(
                        "Action ID belongs to another request"
                    )
                return {
                    key: value
                    for key, value in previous.items()
                    if key != "fingerprint"
                }
            if action not in READ_ACTIONS and not re.fullmatch(
                r"[a-f0-9]{32}:[A-Za-z0-9._:-]{1,95}", action_id
            ):
                raise ValueError("A new effect requires its journal epoch")
            outcome = {
                "action_id": action_id,
                "status": "running",
                "result": None,
                "error": None,
                "fingerprint": digest,
                "action": action,
            }
            if action not in READ_ACTIONS:
                self.actions[action_id] = outcome
                self.persist()
            await self.exchange(dict(request, args=args), outcome)
            if action not in READ_ACTIONS:
                self.persist()
            return {
                key: value
                for key, value in outcome.items()
                if key != "fingerprint"
            }

    async def exchange(self, request, outcome):
        if not self.available:
            outcome.update(
                status="failed",
                error="Android authentication is not configured",
            )
            return
        sent = False
        try:
            async with self.journal_connection() as (socket, epoch):
                self.retire_completed(epoch)
                if request["action"] not in READ_ACTIONS and not request[
                    "action_id"
                ].startswith(epoch + ":"):
                    outcome.update(
                        status="failed",
                        error="stale_epoch; action was not sent",
                    )
                    return
                await socket.send_json(request)
                sent = True
                packet = await asyncio.wait_for(
                    socket.receive(),
                    125 if request["action"] == "speak" else 15,
                )
                if packet.type != WSMsgType.TEXT:
                    raise ValueError("Android closed without an outcome")
                response = json.loads(packet.data)
                if not isinstance(response, dict):
                    raise ValueError("Android outcome must be an object")
                if response.get("action_id") != request["action_id"]:
                    raise ValueError("Android action ID mismatch")
                if response.get("status") not in (
                    "completed",
                    "failed",
                    "outcome_unknown",
                ):
                    raise ValueError("Invalid Android action status")
                outcome.update(
                    {
                        key: response.get(key)
                        for key in ("status", "result", "error")
                    }
                )
        except (ClientError, OSError, asyncio.TimeoutError, ValueError):
            outcome.update(
                status="outcome_unknown" if sent else "failed",
                error=(
                    "Android response unavailable; "
                    "this action was not retried"
                ),
            )


def validate_configuration(configuration):
    if not isinstance(configuration, dict):
        raise ValueError("Android configuration must be an object")
    token = configuration.get("android_token")
    if (
        not isinstance(token, str)
        or not 32 <= len(token) <= 4096
        or not token.isascii()
        or any(ord(char) < 33 for char in token)
        or configuration.get("android_port") != 8765
    ):
        raise ValueError("Private Android token and port 8765 required")
