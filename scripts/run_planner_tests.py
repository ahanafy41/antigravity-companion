"""Offline checks for an enforced no-tools CLI voice planner."""

import asyncio
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from cli_client import CLIUnavailable  # noqa: E402
from voice_planner import VoicePlanner  # noqa: E402


class FakeCLI:
    def __init__(self, tools=None, outcome="success"):
        self.tools = [] if tools is None else tools
        self.outcome = outcome
        self.process = None
        self.arguments = None
        self.cwd = None
        self.input_before_init = False

    async def spawn(self, arguments, cwd):
        self.arguments, self.cwd = arguments, Path(cwd)
        marker = self.cwd / "prompt-delivered"
        input_code = (
            "line=sys.stdin.readline()\n"
            "Path(" + repr(str(marker)) + ").write_text(line)\n"
        )
        init_code = (
            "print(json.dumps({'event':'init','init':{'tools':"
            + repr(self.tools)
            + "}}),flush=True)\n"
        )
        script = "import json,sys,time\nfrom pathlib import Path\n"
        script += (
            input_code + init_code
            if self.input_before_init
            else init_code + input_code
        )
        if self.outcome == "wait":
            script += "time.sleep(60)\n"
        elif self.outcome == "tool":
            script += (
                "print(json.dumps({'event':'step_update','step_update':"
                "{'step_type':'tool',"
                "'tool_name':'run_command'}}),flush=True)\n"
                "time.sleep(60)\n"
            )
        else:
            status = "SUCCESS" if self.outcome == "success" else "ERROR"
            script += (
                "print(json.dumps({'event':'result','result':{'status':"
                + repr(status)
                + ",'structured_output':{'action':None,"
                "'args':{},'done':True,'text':'done'}}}),flush=True)\n"
                "time.sleep(60)\n"
            )
        self.process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-u",
            "-c",
            script,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        return self.process


class PlannerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.cli = FakeCLI()
        self.planner = VoicePlanner(self.cli, self.folder.name)
        self.session = {
            "model": "flash",
            "effort": "low",
            "cwd": "untrusted",
            "agent": "untrusted-agent",
            "project": "untrusted",
        }

    async def asyncTearDown(self):
        if (
            self.cli.process is not None
            and self.cli.process.returncode is None
        ):
            self.cli.process.kill()
            await self.cli.process.wait()
        self.folder.cleanup()

    async def test_no_tools_config_selected_and_result_is_owned(self):
        result = json.loads(
            await self.planner(self.session, "bounded request")
        )
        self.assertTrue(result["done"])
        self.assertIsNotNone(self.cli.process.returncode)
        self.assertIn("--json-schema", self.cli.arguments)
        self.assertEqual(
            self.cli.arguments[self.cli.arguments.index("--agent") + 1],
            "companion-voice",
        )
        self.assertIn("flash", self.cli.arguments)
        self.assertIn("low", self.cli.arguments)
        self.assertNotIn("untrusted-agent", self.cli.arguments)
        self.assertNotIn("--project", self.cli.arguments)
        config = (
            self.cli.cwd / ".agents/agents/companion-voice.md"
        ).read_text()
        for setting in [
            "tools: []",
            "skills: []",
            "plugins: []",
            "mcpServers: []",
            "commandExecutionPolicy: 'off'",
        ]:
            self.assertIn(setting, config)

    async def test_documented_prompt_then_init_ordering_completes(self):
        self.cli.input_before_init = True
        with patch("voice_planner.PLANNER_TIMEOUT", 2):
            step = json.loads(await self.planner(self.session, "prompt"))
        self.assertTrue(step["done"])
        self.assertIsNotNone(self.cli.process.returncode)

    async def test_unexpected_init_tools_reject_result(self):
        self.cli.tools = ["run_command"]
        with self.assertRaises(CLIUnavailable):
            await self.planner(self.session, "must not be delivered")
        self.assertIsNotNone(self.cli.process.returncode)

    async def test_tool_step_rejected_and_owned_process_stopped(self):
        self.cli.outcome = "tool"
        with self.assertRaises(CLIUnavailable):
            await self.planner(self.session, "prompt")
        self.assertIsNotNone(self.cli.process.returncode)

    async def test_error_result_never_becomes_step(self):
        self.cli.outcome = "error"
        with self.assertRaises(CLIUnavailable):
            await self.planner(self.session, "prompt")
        self.assertIsNotNone(self.cli.process.returncode)

    async def test_cancel_stops_owned_planner(self):
        self.cli.outcome = "wait"
        task = asyncio.create_task(self.planner(self.session, "prompt"))
        for _ in range(200):
            if self.cli.cwd and (self.cli.cwd / "prompt-delivered").exists():
                break
            await asyncio.sleep(0.01)
        self.assertTrue((self.cli.cwd / "prompt-delivered").exists())
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertIsNotNone(self.cli.process.returncode)

    async def test_timeout_stops_owned_planner(self):
        self.cli.outcome = "wait"
        with patch("voice_planner.PLANNER_TIMEOUT", 0.2):
            with self.assertRaises(CLIUnavailable):
                await self.planner(self.session, "prompt")
        self.assertIsNotNone(self.cli.process.returncode)

    async def test_input_limit_rejects_before_process_spawn(self):
        with self.assertRaises(CLIUnavailable):
            await self.planner(self.session, "x" * (256 * 1024 + 1))
        self.assertIsNone(self.cli.process)

    async def test_modified_agent_config_refused_without_overwrite(self):
        await self.planner(self.session, "prompt")
        target = self.cli.cwd / ".agents/agents/companion-voice.md"
        changed = target.read_text().replace(
            "tools: []", "tools: [run_command]"
        )
        target.write_text(changed)
        self.cli.process = None
        with self.assertRaises(CLIUnavailable):
            await self.planner(self.session, "prompt")
        self.assertIsNone(self.cli.process)
        self.assertEqual(target.read_text(), changed)


if __name__ == "__main__":
    unittest.main(verbosity=2)
