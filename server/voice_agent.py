"""Bounded JSON voice planning, journaled Android effects and real speech."""

import asyncio
import hashlib
import json
import secrets
import time

from storage import StorageConflict
from cli_client import CLIUnavailable

VOICE_ACTIONS = {
    "tree",
    "select",
    "click",
    "text",
    "scroll",
    "back",
    "home",
    "recents",
    "notifications",
    "launch_app",
}
READ_ACTIONS = {"tree", "select"}
STEP_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": ["string", "null"]},
        "args": {"type": "object"},
        "done": {"type": "boolean"},
        "text": {"type": "string"},
    },
    "required": ["action", "args", "done"],
    "additionalProperties": False,
}


def parse_step(response):
    if not isinstance(response, str) or len(response) > 16384:
        raise ValueError("Voice response exceeds limit")
    step = json.loads(response.lstrip("\ufeff").strip())
    if not isinstance(step, dict) or set(step) - set(
        STEP_SCHEMA["properties"]
    ):
        raise ValueError("Voice response must be a bounded action object")
    if (
        not isinstance(step.get("args"), dict)
        or type(step.get("done")) is not bool
    ):
        raise ValueError("Invalid voice step")
    if not {"action", "args", "done"} <= set(step):
        raise ValueError("Voice step is missing required fields")
    action = step["action"]
    if action is not None and not isinstance(action, str):
        raise ValueError("Voice action must be text or null")
    if (step["done"] and action is not None) or (
        not step["done"] and action not in VOICE_ACTIONS
    ):
        raise ValueError("Unsupported voice action")
    text = step.get("text", "")
    if not isinstance(text, str) or len(text) > 2000:
        raise ValueError("Invalid spoken response")
    return step


class VoiceAgent:
    def __init__(self, store, planner, android):
        self.store, self.planner, self.android = store, planner, android
        self.document = store.read("voice-runs")
        self.runs = self.document.setdefault("runs", {})
        self.cancelled_requests = self.document.setdefault(
            "cancelled_requests", {}
        )
        self.tasks = {}
        self.stopping = False
        changed = False
        for run in self.runs.values():
            if run["state"] == "running":
                run.update(
                    state="interrupted", error="Server restarted; not replayed"
                )
                changed = True
        if changed:
            self.persist()

    def persist(self):
        self.store.write("voice-runs", self.document)

    def detail(self, voice_id):
        return json.loads(json.dumps(self.runs[voice_id]))

    def start(self, session, request):
        text, request_id = request.get("text"), request.get("request_id")
        if not isinstance(text, str) or not text.strip() or len(text) > 4096:
            raise ValueError("Voice text must contain 1..4096 characters")
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
            raise ValueError("Voice request_id is required")
        digest = hashlib.sha256(
            json.dumps(
                {"text": text, "session_id": session["session_id"]},
                sort_keys=True,
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
        for run in self.runs.values():
            if run.get("request_id") == request_id:
                if run.get("fingerprint") != digest:
                    raise StorageConflict("Voice request ID conflict")
                return self.detail(run["voice_id"])
        if self.stopping or any(
            run["state"] == "running" for run in self.runs.values()
        ):
            raise StorageConflict("A voice agent is already active")
        if len(self.runs) >= 256:
            raise StorageConflict(
                "Voice history limit reached; archive it first"
            )
        voice_id = secrets.token_hex(16)
        run = {
            "voice_id": voice_id,
            "request_id": request_id,
            "fingerprint": digest,
            "session_id": session["session_id"],
            "text": text,
            "state": (
                "cancelled"
                if request_id in self.cancelled_requests
                else "running"
            ),
            "steps": [],
            "created_at": time.time(),
        }
        self.runs[voice_id] = run
        try:
            self.persist()
        except OSError:
            del self.runs[voice_id]
            raise
        if run["state"] == "running":
            self.tasks[voice_id] = asyncio.create_task(
                self.execute(session, run)
            )
        return self.detail(voice_id)

    async def action(self, run, action, args):
        action_id = secrets.token_hex(16)
        if action not in READ_ACTIONS:
            journal = await self.android.journal_identity()
            action_id = journal["epoch"] + ":" + action_id
        step = {
            "action_id": action_id,
            "action": action,
            "args": args,
            "status": "pending",
        }
        run["steps"].append(step)
        self.persist()
        outcome = await self.android.execute(
            {"action_id": action_id, "action": action, "args": args}
        )
        step["status"] = outcome.get("status", "outcome_unknown")
        self.persist()
        if step["status"] != "completed":
            raise ValueError("Android action failed or its outcome is unknown")
        return outcome

    async def execute(self, session, run):
        history = []
        try:
            for _ in range(5):
                prompt = json.dumps(
                    {
                        "instruction": (
                            "Return one JSON step only. Never execute "
                            "host tools or code. Choose an allowed Android "
                            "action or done=true with action=null. Use fresh "
                            "tree/select snapshot IDs for click/text/scroll. "
                            "Do not claim success for failed actions. Stop "
                            "when the user's request is satisfied."
                        ),
                        "allowed_actions": sorted(VOICE_ACTIONS),
                        "request": run["text"],
                        "outcomes": history,
                    },
                    ensure_ascii=False,
                )
                step = parse_step(
                    await asyncio.wait_for(self.planner(session, prompt), 120)
                )
                if step["done"]:
                    if step.get("text"):
                        await self.action(run, "speak", {"text": step["text"]})
                    run["state"] = "completed"
                    break
                outcome = await self.action(run, step["action"], step["args"])
                bounded = json.dumps(outcome.get("result"), ensure_ascii=False)
                history.append(
                    {
                        "action": step["action"],
                        "status": "completed",
                        "result": bounded[:32768],
                    }
                )
            else:
                raise ValueError("Voice step limit reached")
        except asyncio.CancelledError:
            run.update(state="cancelled", error="Voice agent cancelled")
            for step in run["steps"]:
                if step["status"] == "pending":
                    step["status"] = "outcome_unknown"
                    run["outcome_unknown"] = True
            raise
        except (
            OSError,
            ValueError,
            KeyError,
            CLIUnavailable,
            StorageConflict,
            asyncio.TimeoutError,
        ):
            run.update(
                state="failed", error="Voice planning or device action failed"
            )
        finally:
            run["completed_at"] = time.time()
            self.persist()

    async def cancel_request(self, request_id):
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
            raise ValueError("Voice request_id is required")
        if (
            len(self.cancelled_requests) >= 512
            and request_id not in self.cancelled_requests
        ):
            raise StorageConflict("Voice cancellation history limit reached")
        self.cancelled_requests[request_id] = time.time()
        self.persist()
        for run in self.runs.values():
            if run.get("request_id") == request_id:
                return await self.cancel(run["voice_id"])
        return {"state": "cancelled", "request_id": request_id}

    async def cancel(self, voice_id):
        run = self.runs[voice_id]
        task = self.tasks.get(voice_id)
        self.stopping = True
        try:
            if run["state"] == "running" and task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    if run["state"] == "running":
                        run.update(state="cancelled", completed_at=time.time())
                        self.persist()
            utterances = [
                step
                for step in run.get("steps", [])
                if step["action"] == "speak" and step["status"] != "completed"
            ]
            for utterance in utterances:
                try:
                    outcome = await asyncio.wait_for(
                        self.action(
                            run,
                            "speech_cancel",
                            {"utterance_id": utterance["action_id"]},
                        ),
                        10,
                    )
                    run["speech_cancel_confirmed"] = outcome.get(
                        "result", {}
                    ).get("speech_state") in ("was_cancelled", "no_match")
                except (
                    OSError,
                    ValueError,
                    KeyError,
                    CLIUnavailable,
                    StorageConflict,
                    asyncio.TimeoutError,
                ):
                    run["speech_cancel_confirmed"] = False
                self.persist()
        finally:
            self.stopping = False
        return self.detail(voice_id)

    async def close(self):
        for voice_id in list(self.tasks):
            if not self.tasks[voice_id].done():
                await self.cancel(voice_id)
