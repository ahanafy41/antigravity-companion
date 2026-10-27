"""Durable once schedules and FIFO next-turn queues owned by Companion."""

import asyncio
from datetime import datetime
import hashlib
import json
import math
import secrets
import time

from sessions import RunConflict, TERMINAL
from storage import StorageConflict
from task_runtime import TaskRuntime

MAX_TASKS = 256
MAX_SESSION_PENDING = 64
PUBLIC_FIELDS = {
    "task_id",
    "mode",
    "session_id",
    "message",
    "request_id",
    "state",
    "created_at",
    "completed_at",
    "run_id",
    "scheduled_at",
    "timezone",
    "missed_policy",
    "error",
}


class LocalTasks:
    def __init__(self, store, sessions, clock=time.time, ready=None):
        self.store, self.sessions, self.clock = store, sessions, clock
        self.ready = ready if ready is not None else lambda: True
        self.document = store.read("local-tasks")
        self.entries = self.document.setdefault("tasks", {})
        self.lock = asyncio.Lock()
        self.worker = None
        self.closing = False
        self.worker_error = None
        changed = False
        for entry in self.entries.values():
            if entry["state"] in ("dispatching", "running"):
                self.reconcile(entry)
                changed = True
            elif (
                entry["state"] == "pending"
                and entry["mode"] == "scheduled"
                and entry["due_at"] < self.clock()
            ):
                entry["missed"] = True
                changed = True
        if changed:
            self.persist()

    def persist(self):
        self.store.write("local-tasks", self.document)

    def change(self, entry, **values):
        original = dict(entry)
        entry.update(values)
        try:
            self.persist()
        except OSError:
            entry.clear()
            entry.update(original)
            raise

    def validate(self, payload):
        if not isinstance(payload, dict) or set(payload) - {
            "mode",
            "session_id",
            "message",
            "request_id",
            "scheduled_at",
            "missed_policy",
        }:
            raise ValueError("Invalid local task payload")
        mode, session_id = payload.get("mode"), payload.get("session_id")
        if not isinstance(mode, str) or mode not in ("queued", "scheduled"):
            raise ValueError("Local task mode must be queued or scheduled")
        if (
            not isinstance(session_id, str)
            or session_id not in self.sessions.sessions
        ):
            raise ValueError("Local task session does not exist")
        message, request_id = payload.get("message"), payload.get("request_id")
        if (
            not isinstance(message, str)
            or not message.strip()
            or len(message) > 4096
        ):
            raise ValueError(
                "Local task message must contain 1..4096 characters"
            )
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
            raise ValueError("Local task request_id is required")
        values = {
            "mode": mode,
            "session_id": session_id,
            "message": message,
            "request_id": request_id,
        }
        if mode == "scheduled":
            supplied = payload.get("scheduled_at")
            policy = payload.get("missed_policy")
            if not isinstance(supplied, str) or len(supplied) > 64:
                raise ValueError(
                    "scheduled_at requires an ISO timestamp with offset"
                )
            if not isinstance(policy, str) or policy not in (
                "skip",
                "run_once",
            ):
                raise ValueError("An explicit missed_policy is required")
            try:
                when = datetime.fromisoformat(
                    supplied.strip().replace("Z", "+00:00")
                )
                if when.tzinfo is None or when.utcoffset() is None:
                    raise ValueError("Timestamp needs timezone")
                due = when.timestamp()
                if not math.isfinite(due):
                    raise ValueError("Timestamp must be finite")
            except (ValueError, OverflowError, OSError) as failure:
                raise ValueError(
                    "Invalid scheduled timestamp or timezone"
                ) from failure
            values.update(
                scheduled_at=when.isoformat(),
                timezone=when.tzname(),
                missed_policy=policy,
                due_at=due,
            )
        elif "scheduled_at" in payload or "missed_policy" in payload:
            raise ValueError("Queued tasks do not accept scheduled timing")
        return values

    def create(self, payload):
        if self.closing:
            raise StorageConflict("Local task engine is closing")
        values = self.validate(payload)
        fingerprint = hashlib.sha256(
            json.dumps(values, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        for entry in self.entries.values():
            if entry["request_id"] == values["request_id"]:
                if entry["fingerprint"] != fingerprint:
                    raise StorageConflict("Local task request ID conflict")
                return self.detail(entry["task_id"])
        if len(self.entries) >= MAX_TASKS:
            raise StorageConflict("Local task history limit reached")
        if (
            sum(
                entry["session_id"] == values["session_id"]
                and entry["state"] in ("pending", "dispatching", "running")
                for entry in self.entries.values()
            )
            >= MAX_SESSION_PENDING
        ):
            raise StorageConflict("Session pending task limit reached")
        task_id = secrets.token_hex(16)
        sequence = self.document.get("sequence", 0) + 1
        entry = dict(
            values,
            task_id=task_id,
            fingerprint=fingerprint,
            occurrence_id="local-task:" + task_id,
            sequence=sequence,
            created_at=self.clock(),
            state="pending",
            run_id=None,
        )
        if values["mode"] == "scheduled":
            entry["missed"] = values["due_at"] < self.clock()
        self.entries[task_id] = entry
        previous_sequence = self.document.get("sequence")
        self.document["sequence"] = sequence
        try:
            self.persist()
        except OSError:
            del self.entries[task_id]
            if previous_sequence is None:
                self.document.pop("sequence", None)
            else:
                self.document["sequence"] = previous_sequence
            raise
        return self.detail(task_id)

    def detail(self, task_id):
        entry = self.entries[task_id]
        row = {
            key: value for key, value in entry.items() if key in PUBLIC_FIELDS
        }
        row["cancellable"] = entry["state"] == "pending"
        if (
            entry["state"] == "running"
            and entry.get("run_id") in self.sessions.runs
        ):
            row["cancellable"] = TaskRuntime(self.sessions).owned(
                self.sessions.runs[entry["run_id"]]
            )
        return row

    def listing(self):
        entries = sorted(
            self.entries.values(), key=lambda item: item["sequence"]
        )
        return {
            "tasks": [self.detail(entry["task_id"]) for entry in entries],
            "worker_error": self.worker_error,
        }

    def occurrence(self, entry):
        for run in self.sessions.runs.values():
            if (
                run.get("client_request_id") == entry["occurrence_id"]
                and run["session_id"] == entry["session_id"]
            ):
                expected = hashlib.sha256(
                    entry["message"].encode()
                ).hexdigest()
                if run.get("fingerprint") != expected:
                    return None
                return run
        return None

    def reconcile(self, entry):
        run = self.occurrence(entry)
        if run is None:
            entry.update(
                state="interrupted",
                completed_at=self.clock(),
                error="Dispatch outcome unknown; not replayed",
            )
            return
        entry.update(run_id=run["run_id"], state=run["state"])
        if run["state"] in TERMINAL:
            entry["completed_at"] = run.get("completed_at", self.clock())
            if run.get("error"):
                entry["error"] = (
                    "Owned session turn did not complete successfully"
                )

    async def tick(self):
        async with self.lock:
            if self.closing:
                return
            for entry in self.entries.values():
                if entry["state"] in ("dispatching", "running"):
                    original = dict(entry)
                    self.reconcile(entry)
                    if entry != original:
                        try:
                            self.persist()
                        except OSError:
                            entry.clear()
                            entry.update(original)
                            raise
            if not self.ready():
                return
            entries = sorted(
                self.entries.values(), key=lambda item: item["sequence"]
            )
            for entry in entries:
                if entry["state"] != "pending":
                    continue
                if entry["mode"] == "scheduled":
                    if self.clock() < entry["due_at"]:
                        continue
                    if (
                        entry.get("missed")
                        and entry["missed_policy"] == "skip"
                    ):
                        self.change(
                            entry,
                            state="skipped",
                            completed_at=self.clock(),
                            error="Missed occurrence skipped by policy",
                        )
                        continue
                try:
                    session = self.sessions.sessions[entry["session_id"]]
                    self.sessions.check_capacity(session)
                except RunConflict:
                    continue
                except KeyError:
                    self.change(
                        entry,
                        state="failed",
                        completed_at=self.clock(),
                        error="Local task session no longer exists",
                    )
                    continue
                self.change(entry, state="dispatching")
                try:
                    run_id = self.sessions.start(
                        entry["session_id"],
                        {
                            "message": entry["message"],
                            "client_request_id": entry["occurrence_id"],
                        },
                    )
                except RunConflict:
                    self.change(entry, state="pending")
                    continue
                except (OSError, ValueError, KeyError):
                    self.reconcile(entry)
                    self.persist()
                    continue
                self.change(entry, state="running", run_id=run_id)

    async def cancel(self, task_id):
        async with self.lock:
            entry = self.entries[task_id]
            if entry["state"] == "pending":
                self.change(
                    entry, state="cancelled", completed_at=self.clock()
                )
            elif entry["state"] in ("running", "dispatching"):
                run = self.occurrence(entry)
                if run is None:
                    raise RunConflict(
                        "Local task outcome unknown; cancellation unconfirmed"
                    )
                await TaskRuntime(self.sessions).cancel(run["run_id"])
                self.reconcile(entry)
                self.persist()
            return self.detail(task_id)

    async def start(self):
        if self.closing:
            raise StorageConflict("Local task engine is closing")
        if self.worker is None or self.worker.done():
            self.worker = asyncio.create_task(self.run_worker())

    async def run_worker(self):
        try:
            while not self.closing:
                await self.tick()
                await asyncio.sleep(1)
        except (OSError, ValueError, KeyError):
            self.worker_error = (
                "Local task persistence failed; dispatch paused"
            )

    async def close(self):
        self.closing = True
        if self.worker is not None:
            self.worker.cancel()
            await asyncio.gather(self.worker, return_exceptions=True)
        async with self.lock:
            pass
