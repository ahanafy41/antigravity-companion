"""Owned server shutdown and approved UI routing regression checks."""

import asyncio
from pathlib import Path
import sys
import socket
import tempfile
import unittest
from unittest.mock import Mock, patch

from aiohttp import ClientSession, CookieJar, web

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from application import create_app  # noqa: E402


class ShutdownTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        with patch.object(Path, "home", return_value=Path(self.folder.name)):
            self.app = create_app(Path(self.folder.name) / "data", 0)
        self.callback = Mock()
        self.app["shutdown_callback"] = self.callback
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.app["port"] = site._server.sockets[0].getsockname()[1]
        self.url = f'http://127.0.0.1:{self.app["port"]}/api/v1'
        self.client = ClientSession(cookie_jar=CookieJar(unsafe=True))

    async def asyncTearDown(self):
        await self.client.close()
        await self.runner.cleanup()
        self.folder.cleanup()

    async def csrf(self):
        response = await self.client.get(self.url + "/auth/session")
        return (await response.json())["csrf_token"]

    async def test_shutdown_requires_session_and_csrf(self):
        response = await self.client.post(self.url + "/system/shutdown")
        self.assertEqual(response.status, 401)
        await self.csrf()
        response = await self.client.post(self.url + "/system/shutdown")
        self.assertEqual(response.status, 403)
        self.callback.assert_not_called()

    async def test_shutdown_accepts_once_and_never_claims_stopped(self):
        headers = {"X-CSRF-Token": await self.csrf()}
        for _ in range(2):
            response = await self.client.post(
                self.url + "/system/shutdown", headers=headers
            )
            self.assertEqual(response.status, 202)
            self.assertEqual((await response.json())["status"], "stopping")
        await asyncio.sleep(0.3)
        self.callback.assert_called_once_with()

    async def test_shutdown_rejects_foreign_origin_and_read_method(self):
        csrf = await self.csrf()
        response = await self.client.post(
            self.url + "/system/shutdown",
            headers={"X-CSRF-Token": csrf, "Origin": "https://bad.example"},
        )
        self.assertEqual(response.status, 403)
        response = await self.client.get(self.url + "/system/shutdown")
        self.assertEqual(response.status, 405)
        self.callback.assert_not_called()

    async def test_embedded_host_without_callback_does_not_fake_shutdown(self):
        self.app["shutdown_callback"] = None
        response = await self.client.post(
            self.url + "/system/shutdown",
            headers={"X-CSRF-Token": await self.csrf()},
        )
        self.assertEqual(response.status, 503)
        self.callback.assert_not_called()

    async def test_start_page_is_served_under_same_security_headers(self):
        response = await self.client.get(
            self.url.removesuffix("/api/v1") + "/start"
        )
        self.assertEqual(response.status, 200)
        self.assertIn("text/html", response.headers["Content-Type"])
        self.assertIn(
            "script-src 'self'", response.headers["Content-Security-Policy"]
        )


class OwnedProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_shutdown_exits_only_the_owned_server_cleanly(self):
        with tempfile.TemporaryDirectory() as folder:
            with socket.socket() as reserved:
                reserved.bind(("127.0.0.1", 0))
                port = reserved.getsockname()[1]
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                str(Path(__file__).resolve().parents[1] / "server/server.py"),
                "--port",
                str(port),
                "--data-dir",
                folder,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                ready = await asyncio.wait_for(process.stdout.readline(), 25)
                self.assertIn(b"Local URL:", ready)
                origin = "http://127.0.0.1:" + str(port)
                async with ClientSession(
                    cookie_jar=CookieJar(unsafe=True)
                ) as client:
                    for attempt in range(40):
                        try:
                            response = await client.get(origin + "/health")
                            break
                        except OSError:
                            await asyncio.sleep(0.05)
                    self.assertEqual(response.status, 200)
                    response = await client.get(
                        origin + "/api/v1/auth/session"
                    )
                    csrf = (await response.json())["csrf_token"]
                    response = await client.post(
                        origin + "/api/v1/system/shutdown",
                        headers={"X-CSRF-Token": csrf},
                    )
                    self.assertEqual(response.status, 202)
                    self.assertEqual(
                        (await response.json())["status"], "stopping"
                    )
                await asyncio.wait_for(process.wait(), 20)
                self.assertEqual(process.returncode, 0)
            finally:
                if process.returncode is None:
                    process.kill()
                    await process.wait()


if __name__ == "__main__":
    unittest.main()
