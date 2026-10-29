"""Durable session turns and single-owner streaming CLI processes."""

import asyncio
import bisect
from collections import deque
import hashlib
import itertools
import json
import os
from pathlib import Path
import signal
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


def format_human_permission_question(tool_name, params):
    if not isinstance(params, dict):
        params = {}
    if tool_name in ("run_command", "command"):
        cmd_str = str(params.get("CommandLine") or params.get("command") or "").strip()
        if len(cmd_str) > 200:
            cmd_str = cmd_str[:200] + "..."
        cwd = str(params.get("Cwd") or params.get("cwd") or "").strip()
        cwd_part = f"\nالمجلد الحالي: {cwd}" if cwd else ""
        return f"هل تريد الموافقة على تشغيل أمر الطرفية التالي:\n{cmd_str}{cwd_part}"

    elif tool_name in ("write_file", "write_to_file", "write"):
        target = str(params.get("TargetFile") or params.get("path") or params.get("Path") or "").strip()
        desc = str(params.get("Description") or "").strip()
        desc_part = f"\nالوصف: {desc}" if desc else ""
        return f"هل تريد الموافقة على إنشاء أو كتابة الملف التالي:\n{target}{desc_part}"

    elif tool_name in ("edit_file", "replace_file_content", "multi_replace_file_content"):
        target = str(params.get("TargetFile") or params.get("path") or params.get("Path") or "").strip()
        instruction = str(params.get("Instruction") or params.get("Description") or "").strip()
        inst_part = f"\nالتعليمات: {instruction}" if instruction else ""
        return f"هل تريد الموافقة على تعديل محتوى الملف التالي:\n{target}{inst_part}"

    elif tool_name in ("search_web", "web_search"):
        query = str(params.get("query") or params.get("Query") or "").strip()
        domain = str(params.get("domain") or "").strip()
        domain_part = f" (نطاق البحث: {domain})" if domain else ""
        return f"هل تريد الموافقة على إجراء بحث في الويب عن:\n\"{query}\"{domain_part}؟"

    elif tool_name in ("read_url_content", "fetch", "browser_open"):
        url = str(params.get("Url") or params.get("url") or params.get("Uri") or "").strip()
        return f"هل تريد الموافقة على جلب وقراءة محتوى الرابط التالي:\n{url}"

    elif tool_name == "invoke_subagent":
        subagents = params.get("Subagents", [])
        if isinstance(subagents, list) and len(subagents) > 0 and isinstance(subagents[0], dict):
            first = subagents[0]
            role = first.get("Role") or first.get("TypeName") or "وكيل فرعي"
            prompt_snippet = str(first.get("Prompt", "")).strip()
            if len(prompt_snippet) > 150:
                prompt_snippet = prompt_snippet[:150] + "..."
            return f"هل تريد الموافقة على استدعاء وتفويض الوكيل الفرعي ({role}):\nالمهمة: {prompt_snippet}"
        else:
            role = params.get("Role") or params.get("TypeName") or "وكيل فرعي"
            return f"هل تريد الموافقة على استدعاء وتكليف الوكيل الفرعي ({role})؟"

    elif tool_name == "define_subagent":
        name = params.get("name") or params.get("Name") or "وكيل جديد"
        desc = params.get("description") or params.get("Description") or ""
        return f"هل تريد الموافقة على تعريف وتجهيز وكيل فرعي جديد ({name}):\n{desc}"

    elif tool_name == "manage_subagents":
        action = params.get("Action", "إدارة")
        return f"هل تريد الموافقة على إجراء إدارة الوكلاء الفرعيين (إجراء: {action})؟"

    elif tool_name == "send_message":
        recipient = params.get("Recipient", "وكيل فرعي")
        msg = str(params.get("Message", "")).strip()
        if len(msg) > 120:
            msg = msg[:120] + "..."
        return f"هل تريد الموافقة على إرسال رسالة إلى الوكيل ({recipient}):\n{msg}"

    elif tool_name == "schedule":
        duration = params.get("DurationSeconds")
        cron = params.get("CronExpression")
        prompt = str(params.get("Prompt", "")).strip()
        if len(prompt) > 120:
            prompt = prompt[:120] + "..."
        if duration:
            time_info = f"بعد {duration} ثانية"
        elif cron:
            time_info = f"حسب جدول cron: {cron}"
        else:
            time_info = "مؤقت مجدول"
        return f"هل تريد الموافقة على جدولة مهمة خلفية ({time_info}):\n{prompt}"

    elif tool_name == "manage_task":
        action = params.get("Action", "")
        task_id = params.get("TaskId", "")
        return f"هل تريد الموافقة على إدارة المهمة الخلفية ({task_id}) بإجراء: {action}؟"

    else:
        desc = params.get("toolSummary") or params.get("toolAction") or tool_name
        return f"هل تريد الموافقة والمتابعة لتنفيذ الإجراء التالي:\n{desc}"


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
                if isinstance(event, dict) and "id" in event:
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
        self.sequence += 1
        event = {"id": self.sequence, "event": name, "data": payload}
        encoded_event = json.dumps(event, ensure_ascii=False)
        encoded_len = len(encoded_event.encode("utf-8"))
        if encoded_len > MAX_LINE // 2:
            raise CLIUnavailable("Normalized event exceeds the safety limit")
        self.events.append(event)
        
        # High performance streaming: O(1) size tracking without serializing 500 events on every token
        if not hasattr(self, "_retained_size"):
            self._retained_size = sum(len(json.dumps(r, ensure_ascii=False).encode("utf-8")) for r in self.events)
        else:
            self._retained_size += encoded_len

        while self._retained_size > MAX_LINE // 2 and len(self.events) > 1:
            removed = self.events.popleft()
            self._retained_size -= len(json.dumps(removed, ensure_ascii=False).encode("utf-8"))

        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(encoded_event + "\n")
            stream.flush()
            # Fsync only on terminal states to avoid blocking asyncio event loop on every delta token
            if name in ("result", "error"):
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
        if not self.events or cursor >= self.events[-1]["id"]:
            return []
        if cursor < self.events[0]["id"] - 1:
            return None
        if cursor == self.events[-1]["id"] - 1:
            return [self.events[-1]]

        # Fast path: strictly contiguous sequence IDs without gaps (O(1))
        offset = cursor + 1 - self.events[0]["id"]
        if 0 <= offset < len(self.events) and self.events[offset]["id"] == cursor + 1:
            return list(itertools.islice(self.events, offset, None))

        # Fallback binary search if sequence IDs have gaps (O(log N))
        idx = bisect.bisect_right(self.events, cursor, key=lambda e: e["id"])
        return list(itertools.islice(self.events, idx, None))


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
        self.pending_permissions = {}
        self.restore_missing_runs()
        self.prune_runs()
        for run in self.runs.values():
            if run["state"] == "running":
                self.finish(
                    self.sessions[run["session_id"]],
                    run,
                    "interrupted",
                    "Server restarted; this turn was not retried",
                )
        self.prune_runs()
        self.persist()
        self.prune_events()

    def prune_runs(self, max_runs=60):
        if len(self.runs) <= max_runs:
            return
        active = {rid: r for rid, r in self.runs.items() if r.get("state") not in TERMINAL}
        completed = sorted(
            [r for r in self.runs.values() if r.get("state") in TERMINAL],
            key=lambda r: r.get("completed_at", 0),
            reverse=True,
        )
        keep_completed = {r["run_id"]: r for r in completed[:max_runs]}
        self.runs = {**active, **keep_completed}
        valid_run_ids = set(self.runs.keys())
        for session in self.sessions.values():
            session["runs"] = [rid for rid in session.get("runs", []) if rid in valid_run_ids]

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

    def resolve_permission(self, key, run_id=None):
        if run_id and run_id in self.pending_permissions:
            fut = self.pending_permissions.pop(run_id)
            if not fut.done():
                fut.set_result(key)
                return True
        elif self.pending_permissions:
            for r_id, fut in list(self.pending_permissions.items()):
                self.pending_permissions.pop(r_id, None)
                if not fut.done():
                    fut.set_result(key)
                    return True
        return False

    def needs_permission(self, session, tool_name, params):
        st = {}
        try:
            st = self.store.read("settings")
        except Exception:
            pass

        ap = session.get("autopilot")
        if ap is None:
            ap = bool(st.get("autopilot", False))
        if ap:
            return False

        sm = session.get("safe_mode")
        if sm is None:
            sm = bool(st.get("safe_mode", True))
        if not sm:
            return False

        approved = session.get("approved_tools") or []
        if tool_name in approved:
            return False

        if st.get("allow_commands") and tool_name in ("run_command", "command"):
            return False
        if (st.get("allow_write") or st.get("allow_file_write")) and tool_name in (
            "write_file",
            "write_to_file",
            "write",
            "edit_file",
            "replace_file_content",
            "multi_replace_file_content",
        ):
            return False
        if st.get("allow_web") and tool_name in (
            "search_web",
            "web_search",
            "read_url_content",
            "fetch",
            "browser_open",
        ):
            return False
        if st.get("allow_subagent") and tool_name in (
            "invoke_subagent",
            "define_subagent",
            "manage_subagents",
        ):
            return False
        if st.get("allow_schedule") and tool_name in ("schedule", "manage_task"):
            return False

        wl = st.get("whitelist") or st.get("permissions", {}).get("allow", [])
        if isinstance(wl, list):
            if tool_name in wl or f"{tool_name}(*)" in wl or "command(*)" in wl:
                return False
            cmd_str = str(params.get("CommandLine") or params.get("command") or "").strip()
            if cmd_str and (f"command({cmd_str})" in wl or f"run_command({cmd_str})" in wl):
                return False

        if tool_name in ("read_file", "read"):
            return False

        return True

    async def prompt_permission(self, session, run, tool_name, params):
        process = self.processes.get(session["session_id"])
        is_suspended = False
        if process and process.returncode is None:
            try:
                os.killpg(process.pid, signal.SIGSTOP)
                is_suspended = True
            except Exception:
                pass

        q_text = format_human_permission_question(tool_name, params)
        self.emit(
            run,
            "permission_request",
            {
                "tool": tool_name,
                "question": q_text,
                "params": redact(params),
            },
        )

        fut = asyncio.get_running_loop().create_future()
        self.pending_permissions[run["run_id"]] = fut
        try:
            decision = await asyncio.wait_for(fut, timeout=120.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            decision = "n"
        finally:
            self.pending_permissions.pop(run["run_id"], None)

        if decision in ("y", "a"):
            approved = session.setdefault("approved_tools", [])
            if isinstance(approved, set):
                approved = list(approved)
                session["approved_tools"] = approved
            if tool_name not in approved:
                approved.append(tool_name)
            if decision == "a":
                try:
                    st = self.store.read("settings")
                    wl = st.get("whitelist", [])
                    if isinstance(wl, list) and tool_name not in wl:
                        wl.append(tool_name)
                        st["whitelist"] = wl
                        self.store.write("settings", st)
                except Exception:
                    pass
            if is_suspended and process and process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGCONT)
                except Exception:
                    pass
            self.emit(
                run,
                "permission_result",
                {
                    "answer": decision,
                    "label": "تمت الموافقة ✅" if decision == "y" else "موافقة دائماً ✅🔄",
                    "tool": tool_name,
                },
            )
        else:
            if is_suspended and process and process.returncode is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except Exception:
                    pass
            self.emit(
                run,
                "permission_result",
                {
                    "answer": "n",
                    "label": "تم الرفض ❌",
                    "tool": tool_name,
                },
            )
            self.finish(session, run, "cancelled")
            raise asyncio.CancelledError("User rejected permission request")

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
            "--dangerously-skip-permissions",
        ]
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

    def _drain_transcript(self, session, run, brain_dir, last_line, sent_thinking):
        conv_id = session.get("conversation_id")
        if not conv_id:
            return last_line
        t_file = brain_dir / conv_id / ".system_generated" / "logs" / "transcript.jsonl"
        if not t_file.exists():
            return last_line
        try:
            lines = t_file.read_text(encoding="utf-8", errors="ignore").splitlines()
            if len(lines) <= last_line:
                return last_line
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
                            if t_name in ("write_to_file", "write", "write_file", "edit_file"):
                                t_args = tc.get("args") or {}
                                if isinstance(t_args, str):
                                    try:
                                        t_args = json.loads(t_args)
                                    except Exception:
                                        pass
                                t_file_path = str(
                                    t_args.get("TargetFile")
                                    or t_args.get("target_file")
                                    or t_args.get("Path")
                                    or t_args.get("path")
                                    or ""
                                ).strip().strip('"').strip("'")
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
            return len(lines)
        except Exception:
            return last_line

    async def poll_transcript(self, session, run):
        sent_thinking = set()
        last_line = 0
        brain_dir = Path.home() / ".gemini" / "antigravity-cli" / "brain"
        try:
            while run["state"] == "running":
                last_line = self._drain_transcript(
                    session, run, brain_dir, last_line, sent_thinking
                )
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass
        finally:
            try:
                self._drain_transcript(
                    session, run, brain_dir, last_line, sent_thinking
                )
            except Exception:
                pass

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
                outcome = self.consume(
                    session, run, json.loads(line.decode("utf-8-sig"))
                )
                if asyncio.iscoroutine(outcome):
                    await outcome
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
            TypeError,
            KeyError,
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
            return self.consume_step(session, run, event.get("step_update", {}))
        elif name == "result":
            self.consume_result(session, run, event.get("result", {}))
        elif name == "error":
            self.finish(session, run, "failed", "CLI reported an error")

    def consume_step(self, session, run, step=None):
        if step is None:
            step = run
            run = session
            session = self.sessions.get(run.get("session_id"), {})
        stype = step.get("step_type")
        state = step.get("state")
        if stype == "agent_response":
            delta = step.get("text_delta", "")
            if not isinstance(delta, str):
                raise ValueError("CLI delta must be text")
            if len((run["response"] + delta).encode("utf-8")) > MAX_LINE // 4:
                raise CLIUnavailable("Turn response exceeds the safety limit")
            run["response"] += delta
            self.emit(run, "delta", {"text_delta": delta})
            return
        elif stype == "tool":
            safe_step = dict(step)
            # Bound tool output preview to prevent EventLog buffer overflow, SSE disconnects, and WebView freezes
            MAX_TOOL_OUTPUT = 16384  # 16 KB preview
            if "output" in safe_step and isinstance(safe_step["output"], str) and len(safe_step["output"]) > MAX_TOOL_OUTPUT:
                safe_step["output"] = safe_step["output"][:MAX_TOOL_OUTPUT] + "\n... [تم اختصار العرض المباشر لحماية سرعة وأداء التطبيق]"
            if "tool_info" in safe_step and isinstance(safe_step["tool_info"], dict):
                t_info = dict(safe_step["tool_info"])
                if "output" in t_info and isinstance(t_info["output"], str) and len(t_info["output"]) > MAX_TOOL_OUTPUT:
                    t_info["output"] = t_info["output"][:MAX_TOOL_OUTPUT] + "\n... [تم اختصار العرض المباشر لحماية سرعة وأداء التطبيق]"
                safe_step["tool_info"] = t_info

            self.emit(run, "tool", redact(safe_step))
            tool_info = step.get("tool_info") or {}
            tool_name = step.get("tool_name") or step.get("tool") or tool_info.get("name") or ""
            args = step.get("parameters") or step.get("args") or tool_info.get("parameters") or {}
            target = str(args.get("TargetFile") or args.get("target_file") or args.get("Path") or args.get("path") or "").strip().strip('"').strip("'")
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
            if state != "DONE" and self.needs_permission(session, tool_name, args):
                self.persist()
                return self.prompt_permission(session, run, tool_name, args)
            return None
        elif stype == "thought":
            self.emit(run, "thought", {"text": step.get("thought") or step.get("text") or ""})
            return

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
        res_text = run.get("response", "")

        if (not res_text or not res_text.strip()) and denied:
            action_names = []
            for da in denied:
                if isinstance(da, dict):
                    action_names.append(da.get("display_name") or da.get("action") or "أمر طرفية")
                elif isinstance(da, str):
                    action_names.append(da)
            act_str = "، ".join(set(action_names)) if action_names else "تنفيذ الأوامر"
            notice_text = (
                f"🔒 **تنبيه إدارة الصلاحيات (Antigravity):**\n\n"
                f"حاول الوكيل تنفيذ الإجراء المطلوب ({act_str})، ولكن تم إيقافه لأن وضع الأمان مفعل وهذا الإجراء غير مصرح به حالياً.\n\n"
                f"💡 **خيارات المتابعة الفورية:**\n"
                f"1. **وضع الطيار الآلي (موصى به):** افتح **الإعدادات ⚙️** وقم بتفعيل 'وضع الطيار الآلي' لتنفيذ كافة العمليات وتعديلات الأكواد بحرية وسرعة.\n"
                f"2. **السماح بالأوامر:** أو فعّل خيار 'السماح بتنفيذ أوامر الطرفية' من قسم الصلاحيات للموافقة الدائمة على أوامر Bash دون توقف."
            )
            run["response"] = notice_text
            self.emit(run, "delta", {"text_delta": notice_text})
            self.finish(session, run, "completed")
        elif (
            result.get("error")
            or (not res_text and status not in ("SUCCESS", "COMPLETED", "DONE"))
            or status in ("FAILED", "ERROR")
        ):
            err_msg = str(result.get("error") or "CLI reported failure or denied actions")
            self.finish(
                session,
                run,
                "failed",
                err_msg,
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
        self.prune_runs()
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
        processes = list(self.processes.values())
        if processes:
            async def close_one(proc):
                try:
                    await terminate_process(proc)
                except Exception:
                    pass
                if getattr(proc, "stderr_task", None):
                    await asyncio.gather(proc.stderr_task, return_exceptions=True)

            try:
                async with asyncio.timeout(2.0):
                    await asyncio.gather(
                        *[close_one(p) for p in processes],
                        return_exceptions=True,
                    )
            except (asyncio.TimeoutError, Exception):
                pass


def safe_failure(failure):
    if isinstance(failure, CLIUnavailable):
        return str(failure)
    if isinstance(failure, asyncio.TimeoutError):
        return "CLI turn timed out"
    return "CLI returned an invalid event or the transport failed"
