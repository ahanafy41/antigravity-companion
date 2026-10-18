"""Durable session turns and single-owner streaming CLI processes."""

import asyncio
from collections import deque
import hashlib
import json
import os
from pathlib import Path
import time
import uuid

from cli_client import (
    CLIUnavailable,
    MAX_LINE,
    bounded_read,
    terminate_process,
)
from storage import redact

TERMINAL = {"completed", "failed", "cancelled", "interrupted"}
EVENT_RETENTION_SECONDS = 24 * 60 * 60
EVENT_STORAGE_LIMIT = 32 * MAX_LINE


class RunConflict(Exception):
    """The active turn or request identity conflicts with this request."""


class EventLog:
    def __init__(self, root, run_id):
        self.path = Path(root) / (run_id + ".ndjson")
        self.events = deque(maxlen=500)
        self.sequence = 0
        self.expired = False
        try:
            self.restore_events()
        except FileNotFoundError:
            pass
        self.changed = asyncio.Event()

    def restore_events(self):
        valid_length = 0
        recovery_length = None
        with self.path.open("rb") as stream:
            for line in stream:
                try:
                    event = json.loads(line)
                except (json.JSONDecodeError, UnicodeError):
                    if line.endswith(b"\n"):
                        raise
                    recovery_length = valid_length
                    break
                self.sequence = event["id"]
                self.events.append(event)
                valid_length += len(line)
                if not line.endswith(b"\n"):
                    recovery_length = valid_length
        if recovery_length is not None:
            self.restore_prefix(recovery_length)

    def restore_prefix(self, valid_length):
        original = self.path.read_bytes()
        backup = self.path.with_name(
            self.path.name + ".interrupted-" + uuid.uuid4().hex
        )
        self.write_private(backup, original)
        prefix = original[:valid_length]
        if prefix and not prefix.endswith(b"\n"):
            prefix += b"\n"
        staged = self.path.with_name(".event-" + uuid.uuid4().hex + ".tmp")
        try:
            self.write_private(staged, prefix)
            staged.replace(self.path)
        finally:
            staged.unlink(missing_ok=True)

    @staticmethod
    def write_private(path, content):
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())

    def append(self, name, payload):
        if len(json.dumps(payload).encode("utf-8")) > MAX_LINE // 2:
            raise CLIUnavailable("Normalized event exceeds the safety limit")
        self.sequence += 1
        event = {"id": self.sequence, "event": name, "data": payload}
        self.events.append(event)
        retained_size = sum(
            len(json.dumps(retained).encode("utf-8"))
            for retained in self.events
        )
        while retained_size > MAX_LINE // 2 and len(self.events) > 1:
            removed = self.events.popleft()
            retained_size -= len(json.dumps(removed).encode("utf-8"))
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        if self.path.stat().st_size > MAX_LINE:
            staged = self.path.with_suffix(".tmp")
            with staged.open("w", encoding="utf-8") as stream:
                for retained in self.events:
                    stream.write(
                        json.dumps(retained, ensure_ascii=False) + "\n"
                    )
                stream.flush()
                os.fsync(stream.fileno())
            staged.replace(self.path)
        self.changed.set()

    def expire(self, sequence):
        self.sequence = sequence
        self.expired = True
        self.events.clear()
        self.changed.set()

    def after(self, cursor):
        if self.expired:
            return None
        if self.events and cursor < self.events[0]["id"] - 1:
            return None
        return [event for event in self.events if event["id"] > cursor]


class Sessions:
    def __init__(self, store, cli):
        self.store = store
        self.cli = cli
        self.restore_transaction()
        self.sessions = store.read("sessions").get("sessions", {})
        self.runs = store.read("runs").get("runs", {})
        self.processes = {}
        self.tasks = {}
        self.session_closures = {}
        self.logs = {}
        self.restore_missing_runs()
        for run in self.runs.values():
            if run["state"] == "running":
                self.finish(
                    self.sessions[run["session_id"]],
                    run,
                    "interrupted",
                    "Server restarted; this turn was not retried",
                )
        self.persist()
        self.prune_events()

    def persist(self):
        session_document = self.store.read("sessions")
        session_document["sessions"] = self.sessions
        run_document = self.store.read("runs")
        run_document["runs"] = self.runs
        self.store.write(
            "session-transaction",
            {
                "sessions": session_document,
                "runs": run_document,
            },
        )
        self.store.write("sessions", session_document)
        self.store.write("runs", run_document)
        self.clear_transaction()

    def restore_transaction(self):
        if not self.store.path("session-transaction").exists():
            return
        transaction = self.store.read("session-transaction")
        for name in ("sessions", "runs"):
            document = transaction.get(name)
            if not isinstance(document, dict) or not isinstance(
                document.get(name), dict
            ):
                raise ValueError("Invalid pending session transaction")
        for name in ("sessions", "runs"):
            self.store.write(name, transaction[name])
        self.clear_transaction()

    def clear_transaction(self):
        journal = self.store.path("session-transaction")
        Path(str(journal) + ".bak").unlink(missing_ok=True)
        journal.unlink(missing_ok=True)

    def restore_missing_runs(self):
        for session in self.sessions.values():
            for run_id in session["runs"]:
                if run_id not in self.runs:
                    self.runs[run_id] = {
                        "run_id": run_id,
                        "session_id": session["session_id"],
                        "conversation_id": session["conversation_id"],
                        "state": "interrupted",
                        "message": "",
                        "response": "",
                        "client_request_id": None,
                        "fingerprint": "",
                        "usage": {},
                        "created_at": time.time(),
                        "completed_at": time.time(),
                        "error": (
                            "Legacy turn record missing; outcome unknown; "
                            "not retried"
                        ),
                    }

    def create(self, options):
        session_id = uuid.uuid4().hex
        session = dict(
            options,
            session_id=session_id,
            conversation_id=options.get("conversation_id", ""),
            runs=[],
        )
        self.sessions[session_id] = session
        self.persist()
        return session

    def detail(self, session_id):
        session = dict(self.sessions[session_id])
        session["runs"] = [self.runs[run_id] for run_id in session["runs"]]
        return session

    def log(self, run_id):
        run = self.runs[run_id]
        if run.get("events_expired") or self.events_due(run):
            self.expire_events(run)
        if run_id not in self.logs:
            self.logs[run_id] = EventLog(self.store.root, run_id)
            if run.get("events_expired"):
                self.logs[run_id].expire(run["last_event_id"])
        return self.logs[run_id]

    @staticmethod
    def events_due(run):
        completed_at = run.get("completed_at")
        return (
            run["state"] in TERMINAL
            and completed_at is not None
            and completed_at <= time.time() - EVENT_RETENTION_SECONDS
        )

    def expire_events(self, run):
        run_id = run["run_id"]
        log = self.logs.get(run_id)
        if not run.get("events_expired"):
            log = log or EventLog(self.store.root, run_id)
            self.mark_events_expired(run, log.sequence)
        (self.store.root / (run_id + ".ndjson")).unlink(missing_ok=True)
        if log is not None:
            log.expire(run["last_event_id"])

    def mark_events_expired(self, run, sequence):
        expired = dict(run, events_expired=True, last_event_id=sequence)
        document = self.store.read("runs")
        document["runs"] = dict(self.runs)
        document["runs"][run["run_id"]] = expired
        self.store.write("runs", document)
        run.update(expired)

    def prune_events(self):
        sizes = {
            path.stem: path.stat().st_size
            for path in self.store.root.glob("*.ndjson")
        }
        total = sum(sizes.values())
        completed = sorted(
            (run for run in self.runs.values() if run["state"] in TERMINAL),
            key=lambda run: run.get("completed_at", float("inf")),
        )
        for run in completed:
            if (
                run.get("events_expired")
                or self.events_due(run)
                or total >= EVENT_STORAGE_LIMIT
            ):
                self.expire_events(run)
                total -= sizes.get(run["run_id"], 0)

    def emit(self, run, name, extra=None):
        payload = {"run_id": run["run_id"], "state": run["state"]}
        payload.update(extra or {})
        self.log(run["run_id"]).append(name, payload)

    def start(self, session_id, request):
        session = self.sessions[session_id]
        message = request.get("message")
        request_id = request.get("client_request_id")
        if not isinstance(message, str) or not message.strip():
            raise ValueError("message is required")
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
            raise ValueError("client_request_id is required")
        digest = hashlib.sha256(message.encode("utf-8")).hexdigest()
        for run_id in session["runs"]:
            previous = self.runs[run_id]
            if previous["client_request_id"] == request_id:
                if previous["fingerprint"] != digest:
                    raise RunConflict(
                        "Request ID was used for a different message"
                    )
                if previous.get("start_failed"):
                    self.persist()
                    self.emit(
                        previous,
                        "result",
                        {
                            "response": previous["response"],
                            "error": previous["error"],
                            "usage": previous["usage"],
                            "conversation_id": session["conversation_id"],
                        },
                    )
                return previous["run_id"]
        self.check_capacity(session)
        run_id = uuid.uuid4().hex
        run = {
            "run_id": run_id,
            "session_id": session_id,
            "state": "running",
            "message": message,
            "response": "",
            "client_request_id": request_id,
            "fingerprint": digest,
            "created_at": time.time(),
            "usage": {},
        }
        self.runs[run_id] = run
        session["runs"].append(run_id)
        try:
            self.persist()
            self.emit(run, "state")
        except OSError:
            run.update(
                state="interrupted",
                start_failed=True,
                completed_at=time.time(),
                error="Turn was not started because local persistence failed",
                conversation_id=session["conversation_id"],
            )
            raise
        self.tasks[run_id] = asyncio.create_task(self.execute(session, run))
        return run_id

    def check_capacity(self, session):
        if session["session_id"] in self.session_closures:
            raise RunConflict("The session process is closing")
        self.prune_events()
        event_bytes = sum(
            path.stat().st_size for path in self.store.root.glob("*.ndjson")
        )
        if event_bytes >= EVENT_STORAGE_LIMIT:
            raise RunConflict(
                "Event storage limit reached; export history first"
            )
        if any(
            self.runs[key]["state"] == "running" for key in session["runs"]
        ):
            raise RunConflict("A turn is already active in this session")
        if sum(run["state"] == "running" for run in self.runs.values()) >= 2:
            raise RunConflict("The two active turn limit has been reached")
        total = sum(
            path.stat().st_size
            for path in self.store.root.iterdir()
            if path.is_file()
        )
        if total >= 50 * 1024 * 1024:
            raise RunConflict(
                "Storage limit reached; preserve/export local history"
            )

    async def process(self, session):
        session_id = session["session_id"]
        process = self.processes.get(session_id)
        if process and process.returncode is None:
            return process
        arguments = [
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
        ]
        if session.get("autopilot") is True and session.get("safe_mode") is not True:
            arguments.append("--dangerously-skip-permissions")
        for option in ("model", "agent", "effort", "mode", "project"):
            if session.get(option):
                arguments.extend(["--" + option, session[option]])
        if session.get("sandbox"):
            arguments.append("--sandbox")
        if session["conversation_id"]:
            arguments.extend(["--conversation", session["conversation_id"]])
        process = await self.cli.spawn(arguments, session["cwd"])
        self.processes[session_id] = process
        process.stderr_task = asyncio.create_task(self.drain_stderr(process))
        return process

    async def drain_stderr(self, process):
        try:
            await bounded_read(process.stderr)
        except CLIUnavailable:
            await terminate_process(process)

    async def poll_transcript(self, session, run):
        sent_thinking = set()
        last_line = 0
        brain_dir = Path.home() / ".gemini" / "antigravity-cli" / "brain"
        while run["state"] == "running":
            conv_id = session.get("conversation_id")
            if conv_id:
                t_file = brain_dir / conv_id / ".system_generated" / "logs" / "transcript.jsonl"
                if t_file.exists():
                    try:
                        lines = t_file.read_text(encoding="utf-8", errors="ignore").splitlines()
                        if len(lines) > last_line:
                            for idx in range(last_line, len(lines)):
                                raw = lines[idx].strip()
                                if not raw:
                                    continue
                                try:
                                    entry = json.loads(raw)
                                    etype = entry.get("type")
                                    if etype == "PLANNER_RESPONSE":
                                        th = entry.get("thinking", "")
                                        if th and th not in sent_thinking:
                                            sent_thinking.add(th)
                                            self.emit(run, "thought", {"text": th})
                                        for tc in (entry.get("tool_calls") or []):
                                            t_name = tc.get("name") or ""
                                            if t_name in ("write_to_file", "write"):
                                                t_args = tc.get("args") or {}
                                                if isinstance(t_args, str):
                                                    try:
                                                        t_args = json.loads(t_args)
                                                    except Exception:
                                                        pass
                                                t_file_path = str(t_args.get("TargetFile") or t_args.get("target_file") or "").strip().strip('"').strip("'")
                                                if "brain" in str(t_file_path):
                                                    art_name = Path(t_file_path).name.strip().strip('"').strip("'")
                                                    meta = t_args.get("ArtifactMetadata") or {}
                                                    if isinstance(meta, str):
                                                        try:
                                                            meta = json.loads(meta)
                                                        except Exception:
                                                            pass
                                                    art_summary = (
                                                        meta.get("Summary")
                                                        or meta.get("summary")
                                                        or t_args.get("Description", "")
                                                    )
                                                    self.emit(run, "artifact", {
                                                        "name": art_name,
                                                        "path": str(t_file_path),
                                                        "summary": art_summary,
                                                        "requestFeedback": bool(meta.get("RequestFeedback") or meta.get("requestFeedback", False)),
                                                        "userFacing": bool(meta.get("UserFacing", True) if "UserFacing" in meta else meta.get("userFacing", True)),
                                                    })
                                except Exception:
                                    pass
                            last_line = len(lines)
                    except Exception:
                        pass
            await asyncio.sleep(0.5)

    async def execute(self, session, run):
        process = None
        poll_task = None
        try:
            process = await self.process(session)
            prompt = {
                "event": "user",
                "message": {
                    "content": [{"type": "text", "text": run["message"]}]
                },
            }
            process.stdin.write(
                (json.dumps(prompt, ensure_ascii=False) + "\n").encode("utf-8")
            )
            await process.stdin.drain()
            poll_task = asyncio.create_task(self.poll_transcript(session, run))
            while run["state"] == "running":
                line = await asyncio.wait_for(process.stdout.readline(), 3600)
                if not line:
                    raise CLIUnavailable("CLI ended before a result event")
                if len(line) > MAX_LINE:
                    raise CLIUnavailable("CLI event exceeds the line limit")
                self.consume(
                    session, run, json.loads(line.decode("utf-8-sig"))
                )
        except asyncio.CancelledError:
            if poll_task:
                poll_task.cancel()
            if process:
                await terminate_process(process)
            if run["state"] == "running":
                if run.get("cancel_requested"):
                    self.finish(session, run, "cancelled")
                else:
                    self.finish(session, run, "interrupted", "Server stopped")
            raise
        except (
            CLIUnavailable,
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            ValueError,
            asyncio.TimeoutError,
        ) as failure:
            if poll_task:
                poll_task.cancel()
            if process:
                await terminate_process(process)
            self.finish(session, run, "failed", safe_failure(failure))
        finally:
            if poll_task and not poll_task.done():
                poll_task.cancel()

    def consume(self, session, run, event):
        if not isinstance(event, dict):
            raise ValueError("CLI event must be an object")
        observer = getattr(self, "observer", None)
        if observer is not None:
            observer(run, event)
        name = event.get("event")
        if name in ("step_update", "result") and not isinstance(
            event.get(name), dict
        ):
            raise ValueError("CLI event payload must be an object")
        conversation_id = event.get("conversation_id")
        if conversation_id:
            if not isinstance(conversation_id, str):
                raise ValueError("CLI conversation ID must be text")
            session["conversation_id"] = conversation_id
        if name == "init":
            self.persist()
            self.emit(
                run, "state", {"conversation_id": session["conversation_id"]}
            )
        elif name == "step_update":
            self.consume_step(run, event.get("step_update", {}))
        elif name == "result":
            self.consume_result(session, run, event.get("result", {}))
        elif name == "error":
            self.finish(session, run, "failed", "CLI reported an error")

    def consume_step(self, run, step):
        if step.get("step_type") == "agent_response":
            delta = step.get("text_delta", "")
            if not isinstance(delta, str):
                raise ValueError("CLI delta must be text")
            if len((run["response"] + delta).encode("utf-8")) > MAX_LINE // 4:
                raise CLIUnavailable("Turn response exceeds the safety limit")
            run["response"] += delta
            self.emit(run, "delta", {"text_delta": delta})
        elif step.get("step_type") == "tool":
            self.emit(run, "tool", redact(step))
            tool_name = step.get("tool_name") or step.get("tool") or ""
            args = step.get("parameters") or step.get("args") or {}
            target = str(args.get("TargetFile") or args.get("target_file") or "").strip().strip('"').strip("'")
            if "brain" in str(target) and tool_name in ("write_to_file", "write"):
                art_name = Path(target).name.strip().strip('"').strip("'")
                meta = args.get("ArtifactMetadata") or {}
                self.emit(run, "artifact", {
                    "name": art_name,
                    "path": str(target),
                    "summary": meta.get("Summary") or meta.get("summary") or args.get("Description", ""),
                    "requestFeedback": bool(meta.get("RequestFeedback") or meta.get("requestFeedback", False)),
                    "userFacing": bool(meta.get("UserFacing", True) if "UserFacing" in meta else meta.get("userFacing", True)),
                })
        elif step.get("step_type") == "thought":
            self.emit(run, "thought", {"text": step.get("thought") or step.get("text") or ""})
        self.persist()

    def consume_result(self, session, run, result):
        if result.get("conversation_id"):
            if not isinstance(result["conversation_id"], str):
                raise ValueError("CLI conversation ID must be text")
            session["conversation_id"] = result["conversation_id"]
        if not session["conversation_id"]:
            self.finish(
                session, run, "failed", "CLI did not return a conversation ID"
            )
            return
        response = result.get("response")
        if isinstance(response, str) and response:
            if len(response.encode("utf-8")) > MAX_LINE // 4:
                raise CLIUnavailable("Turn response exceeds the safety limit")
            run["response"] = response
        run["usage"] = result.get("usage", {})
        if not isinstance(run["usage"], dict):
            raise ValueError("CLI usage must be an object")
        session["usage"] = run["usage"]
        session["usage_semantics"] = (
            "CLI snapshot; cumulative scope unverified"
        )
        denied = result.get("denied_actions", [])
        run["denied_actions"] = redact(denied)
        status = str(result.get("status", "")).upper()
        if (
            result.get("error")
            or status not in ("SUCCESS", "COMPLETED")
            or denied
        ):
            self.finish(
                session,
                run,
                "failed",
                "CLI reported failure or denied actions",
            )
        else:
            self.finish(session, run, "completed")

    def finish(self, session, run, state, failure=None):
        if run["state"] in TERMINAL:
            return
        run.update(
            state=state,
            conversation_id=session["conversation_id"],
            completed_at=time.time(),
        )
        if failure:
            run["error"] = failure
        try:
            self.persist()
        except OSError:
            run.update(
                state="interrupted",
                error=(
                    "Final turn persistence failed; "
                    "recover the outcome explicitly"
                ),
            )
            if run["run_id"] in self.logs:
                self.logs[run["run_id"]].changed.set()
            raise
        if failure:
            self.emit(run, "error", {"message": failure})
        self.emit(
            run,
            "result",
            {
                "response": run["response"],
                "conversation_id": session["conversation_id"],
                "usage": run["usage"],
                "error": failure,
            },
        )

    async def cancel(self, run_id):
        run = self.runs[run_id]
        if run["state"] in TERMINAL:
            return run
        session = self.sessions[run["session_id"]]
        run["cancel_requested"] = True
        task = self.tasks.get(run_id)
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        process = self.processes.get(run["session_id"])
        if process:
            await terminate_process(process)
        self.finish(session, run, "cancelled")
        return run

    async def close_session(self, session_id):
        session = self.sessions[session_id]
        if any(
            self.runs[key]["state"] == "running" for key in session["runs"]
        ):
            raise RunConflict("A turn is active in this session")
        task = self.session_closures.get(session_id)
        if task is None:
            task = asyncio.create_task(self.stop_session_process(session_id))
            self.session_closures[session_id] = task
        await asyncio.shield(task)

    async def stop_session_process(self, session_id):
        try:
            process = self.processes.get(session_id)
            if process is not None:
                await terminate_process(process)
                await asyncio.gather(
                    process.stderr_task, return_exceptions=True
                )
                self.processes.pop(session_id, None)
        finally:
            self.session_closures.pop(session_id, None)

    async def close(self):
        await asyncio.gather(
            *self.session_closures.values(), return_exceptions=True
        )
        for task in self.tasks.values():
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        for process in self.processes.values():
            await terminate_process(process)
            await asyncio.gather(process.stderr_task, return_exceptions=True)


def safe_failure(failure):
    if isinstance(failure, CLIUnavailable):
        return str(failure)
    if isinstance(failure, asyncio.TimeoutError):
        return "CLI turn timed out"
    return "CLI returned an invalid event or the transport failed"
