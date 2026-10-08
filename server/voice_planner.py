"""CLI voice planning through a fixed agent with an empty tool allowlist.

Contract: https://www.agy.dev/docs/subagents/ and /docs/cli/headless/.
The fixed agent denies tools; runtime rejects tool inventories and calls.
"""

import asyncio
import json
import os
from pathlib import Path

from cli_client import CLIUnavailable, terminate_process
from voice_agent import STEP_SCHEMA, parse_step

MAX_OUTPUT = 512 * 1024
MAX_LINE = 64 * 1024
MAX_PROMPT = 256 * 1024
MAX_STDERR = 64 * 1024
PLANNER_TIMEOUT = 110
AGENT_NAME = "companion-voice"
AGENT_SOURCE = """---
name: companion-voice
description: Produce one bounded Android action JSON without invoking tools.
tools: []
mcpServers: []
skills: []
plugins: []
commandExecutionPolicy: 'off'
mainAgent: true
subagent: false
model: inherit
---
Return exactly one JSON action step matching the requested schema.
Do not execute tools or code. Android effects are performed by Companion.
"""


class VoicePlanner:
    def __init__(self, cli, store_root):
        self.cli = cli
        self.root = Path(store_root).resolve()
        self.workspace = self.root / ".tmp" / "voice-planner"

    def prepare_workspace(self):
        target = self.workspace / ".agents" / "agents" / (AGENT_NAME + ".md")
        if not target.resolve().is_relative_to(self.root):
            raise CLIUnavailable("Voice planner workspace escapes its owner")
        target.parent.mkdir(parents=True, exist_ok=True)
        expected = AGENT_SOURCE.encode("utf-8")
        try:
            descriptor = os.open(
                target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
        except FileExistsError:
            if target.read_bytes() != expected:
                raise CLIUnavailable(
                    "Voice planner agent configuration changed"
                )
        else:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(expected)
                stream.flush()
                os.fsync(stream.fileno())
        return self.workspace

    async def __call__(self, session, prompt):
        if (
            not isinstance(prompt, str)
            or len(prompt.encode("utf-8")) > MAX_PROMPT
        ):
            raise CLIUnavailable("Voice planner input exceeds its limit")
        try:
            return await asyncio.wait_for(
                self.plan(session, prompt), PLANNER_TIMEOUT
            )
        except asyncio.TimeoutError as failure:
            raise CLIUnavailable("Voice planner timed out") from failure
        except (OSError, UnicodeError, ValueError) as failure:
            raise CLIUnavailable("Voice planner transport failed") from failure

    async def drain_diagnostics(self, process):
        count = 0
        while True:
            chunk = await process.stderr.read(8192)
            if not chunk:
                return
            count += len(chunk)
            if count > MAX_STDERR:
                await terminate_process(process)
                raise CLIUnavailable(
                    "Voice planner diagnostics exceeded limit"
                )

    async def read_event(self, process, budget):
        line = await process.stdout.readline()
        budget[0] += len(line)
        if not line or len(line) > MAX_LINE or budget[0] > MAX_OUTPUT:
            raise CLIUnavailable(
                "Voice planner ended without a bounded result"
            )
        event = json.loads(line.decode("utf-8-sig"))
        if not isinstance(event, dict):
            raise CLIUnavailable("Voice planner event is invalid")
        return event

    def result_step(self, result):
        if not isinstance(result, dict) or result.get("status") != "SUCCESS":
            raise CLIUnavailable("Voice planner did not complete successfully")
        structured = result.get("structured_output")
        if structured is not None:
            response = json.dumps(
                structured, ensure_ascii=False, allow_nan=False
            )
        else:
            response = result.get("response")
        try:
            step = parse_step(response)
            if not set(STEP_SCHEMA["required"]).issubset(step):
                raise ValueError("Voice action is incomplete")
            action = step["action"]
            if action is not None and not isinstance(action, str):
                raise ValueError("Voice action must be text or null")
            return json.dumps(step, ensure_ascii=False, allow_nan=False)
        except (ValueError, TypeError) as failure:
            raise CLIUnavailable(
                "Voice planner returned an invalid action"
            ) from failure

    async def plan(self, session, prompt):
        arguments = [
            "--agent",
            AGENT_NAME,
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--json-schema",
            json.dumps(STEP_SCHEMA),
            "--disable-slash-commands",
        ]
        for key in ("model", "effort"):
            if session.get(key):
                arguments.extend(["--" + key, session[key]])
        process = await self.cli.spawn(arguments, self.prepare_workspace())
        diagnostics = asyncio.create_task(self.drain_diagnostics(process))
        try:
            # Headless stdin starts a turn before its init event is read.
            message = {"event": "user", "message": {"content": prompt}}
            process.stdin.write(
                (json.dumps(message, ensure_ascii=False) + "\n").encode(
                    "utf-8"
                )
            )
            await process.stdin.drain()
            budget = [0]
            event = await asyncio.wait_for(
                self.read_event(process, budget), 15
            )
            initial = event.get("init")
            if (
                event.get("event") != "init"
                or not isinstance(initial, dict)
                or initial.get("tools") != []
            ):
                raise CLIUnavailable(
                    "Voice planner empty tool inventory was not proven"
                )
            for _ in range(256):
                event = await self.read_event(process, budget)
                if diagnostics.done() and diagnostics.exception() is not None:
                    raise diagnostics.exception()
                name = event.get("event")
                if name == "result":
                    return self.result_step(event.get("result"))
                step = event.get("step_update")
                if (
                    name != "step_update"
                    or not isinstance(step, dict)
                    or step.get("step_type")
                    not in ("user_input", "agent_response", "checkpoint")
                    or "subagent_info" in step
                ):
                    raise CLIUnavailable(
                        "Voice planner attempted an unsupported operation"
                    )
            raise CLIUnavailable("Voice planner event limit reached")
        finally:
            try:
                # Kill before closing stdin to avoid racing a Windows exit.
                await terminate_process(process)
            finally:
                process.stdin.close()
                diagnostics.cancel()
                await asyncio.gather(diagnostics, return_exceptions=True)
