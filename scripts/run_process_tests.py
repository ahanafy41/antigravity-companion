"""Targeted process ownership and scoped MCP mutation checks."""

from pathlib import Path
import signal
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import cli_client  # noqa: E402


class ProcessGroupTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        sigkill = patch.object(signal, "SIGKILL", 9, create=True)
        sigkill.start()
        self.addCleanup(sigkill.stop)

    async def check_surviving_child(self, parent_returncode):
        parent = SimpleNamespace(
            pid=4321,
            _companion_pgid=4321,
            returncode=parent_returncode,
            wait=AsyncMock(return_value=0),
        )
        signals = []
        alive = True

        def killpg(group, requested_signal):
            nonlocal alive
            self.assertEqual(group, parent.pid)
            if not alive:
                raise ProcessLookupError()
            if requested_signal:
                signals.append(requested_signal)
            if requested_signal == signal.SIGKILL:
                alive = False

        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os, "killpg", killpg, create=True
        ), patch.object(
            cli_client.os, "getpgid", return_value=parent.pid, create=True
        ), patch.object(
            cli_client, "GROUP_SHUTDOWN_TIMEOUT", 0.01, create=True
        ):
            await cli_client.terminate_process(parent)
        self.assertEqual(signals, [signal.SIGTERM, signal.SIGKILL])

    async def test_child_is_killed_after_parent_already_exited(self):
        await self.check_surviving_child(0)

    async def test_child_is_killed_when_parent_exits_after_term(self):
        await self.check_surviving_child(None)

    async def test_unconfirmed_group_termination_fails(self):
        parent = SimpleNamespace(
            pid=4321,
            _companion_pgid=4321,
            returncode=0,
            wait=AsyncMock(return_value=0),
        )
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os, "killpg", create=True
        ), patch.object(
            cli_client, "GROUP_SHUTDOWN_TIMEOUT", 0.01, create=True
        ):
            with self.assertRaises(cli_client.CLIUnavailable):
                await cli_client.terminate_process(parent)

    async def test_vanished_group_is_not_signalled(self):
        parent = SimpleNamespace(
            pid=4321,
            _companion_pgid=4321,
            returncode=0,
            wait=AsyncMock(return_value=0),
        )
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os,
            "killpg",
            side_effect=ProcessLookupError(),
            create=True,
        ) as killpg:
            await cli_client.terminate_process(parent)
        self.assertTrue(
            all(call.args[1] == 0 for call in killpg.call_args_list)
        )

    async def test_unowned_group_is_never_signalled(self):
        parent = SimpleNamespace(
            pid=4321, returncode=0, wait=AsyncMock(return_value=0)
        )
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os, "killpg", create=True
        ) as killpg:
            with self.assertRaises(cli_client.CLIUnavailable):
                await cli_client.terminate_process(parent)
        killpg.assert_not_called()

    async def test_confirmed_closed_group_is_not_reused(self):
        parent = SimpleNamespace(
            pid=4321,
            returncode=0,
            _companion_pgid=4321,
            wait=AsyncMock(return_value=0),
        )
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os,
            "killpg",
            side_effect=ProcessLookupError(),
            create=True,
        ):
            await cli_client.terminate_process(parent)
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os, "killpg", create=True
        ) as killpg:
            await cli_client.terminate_process(parent)
        killpg.assert_not_called()

    async def test_group_permission_failure_is_not_success(self):
        parent = SimpleNamespace(
            pid=4321,
            returncode=0,
            _companion_pgid=4321,
            wait=AsyncMock(return_value=0),
        )
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.os, "killpg", side_effect=PermissionError(), create=True
        ):
            with self.assertRaises(cli_client.CLIUnavailable):
                await cli_client.terminate_process(parent)

    async def test_spawn_captures_private_group_ownership(self):
        client = cli_client.CLI()
        client.executable = "fixture-cli"
        child = SimpleNamespace(pid=4321)
        with patch.object(cli_client.os, "name", "posix"), patch.object(
            cli_client.asyncio,
            "create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=child,
        ) as spawn:
            spawned = await client.spawn(["--help"], "fixture-workspace")
        self.assertEqual(spawned._companion_pgid, 4321)
        self.assertTrue(spawn.await_args.kwargs["start_new_session"])
        self.assertNotIn("shell", spawn.await_args.kwargs)

    async def test_windows_exited_parent_is_not_reused(self):
        parent = SimpleNamespace(
            pid=4321,
            _companion_pgid=4321,
            returncode=0,
            wait=AsyncMock(return_value=0),
        )
        with patch.object(cli_client.os, "name", "nt"), patch.object(
            cli_client, "terminate_windows_tree", new_callable=AsyncMock
        ) as terminate:
            await cli_client.terminate_process(parent)
        terminate.assert_not_awaited()


class ScopedMCPTests(unittest.IsolatedAsyncioTestCase):
    async def test_mutations_and_followup_listing_keep_workspace(self):
        client = cli_client.CLI()
        client.command = AsyncMock(return_value="--type --env --header")
        client.listing = AsyncMock(return_value=[{"name": "shared"}])
        for action in ("delete", "enable", "disable", "add"):
            client.command.reset_mock()
            client.listing.reset_mock()
            request = {"name": "shared", "commandOrUrl": "fixture"}
            await client.mutate_mcp(action, request, cwd="workspace")
            self.assertEqual(
                client.command.await_args_list[0].kwargs, {"cwd": "workspace"}
            )
            self.assertEqual(
                client.command.await_args_list[1].kwargs, {"cwd": "workspace"}
            )
            client.listing.assert_awaited_once_with("mcp", "workspace")

    async def test_unscoped_mutation_preserves_existing_call_contract(self):
        client = cli_client.CLI()
        client.command = AsyncMock(return_value="")
        client.listing = AsyncMock(return_value=[])
        await client.mutate_mcp("disable", {"name": "shared"})
        self.assertTrue(
            all(not call.kwargs for call in client.command.await_args_list)
        )
        client.listing.assert_awaited_once_with("mcp")


if __name__ == "__main__":
    unittest.main(verbosity=2)
