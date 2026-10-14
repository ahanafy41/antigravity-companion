"""Local browser session bootstrap and isolation regression checks."""

import sys
from pathlib import Path
import unittest

from aiohttp import ClientSession, CookieJar, web
from aiohttp.test_utils import make_mocked_request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from application import auth_session  # noqa: E402
from security import COOKIE, Pairing, isolation  # noqa: E402


class LocalSessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = web.Application(middlewares=[isolation])
        self.app["port"] = 0
        self.app["pairing"] = Pairing()
        self.app.router.add_get("/api/v1/auth/session", auth_session)
        self.app.router.add_get("/api/v1/private", self.private)
        self.app.router.add_post("/api/v1/private", self.private)
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.app["port"] = site._server.sockets[0].getsockname()[1]
        self.url = f'http://127.0.0.1:{self.app["port"]}'
        self.client = ClientSession(cookie_jar=CookieJar(unsafe=True))

    async def asyncTearDown(self):
        await self.client.close()
        await self.runner.cleanup()

    async def private(self, request):
        return web.json_response({"ok": True})

    async def test_session_is_issued_without_pin_and_reused(self):
        response = await self.client.get(self.url + "/api/v1/auth/session")
        self.assertEqual(response.status, 200)
        payload = await response.json()
        self.assertTrue(payload["authenticated"])
        cookie = response.cookies[COOKIE]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Strict")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        repeated = await self.client.get(self.url + "/api/v1/auth/session")
        self.assertEqual(
            (await repeated.json())["csrf_token"], payload["csrf_token"]
        )
        self.assertEqual(len(self.app["pairing"].sessions), 1)
        response = await self.client.post(self.url + "/api/v1/private")
        self.assertEqual(response.status, 403)
        response = await self.client.post(
            self.url + "/api/v1/private",
            headers={"X-CSRF-Token": payload["csrf_token"]},
        )
        self.assertEqual(response.status, 200)

    async def test_private_route_still_requires_a_session(self):
        response = await self.client.get(self.url + "/api/v1/private")
        self.assertEqual(response.status, 401)

    async def test_cross_origin_and_fetch_metadata_cannot_bootstrap(self):
        for headers in (
            {"Origin": "https://attacker.example"},
            {"Origin": "null"},
            {"Origin": f'http://localhost:{self.app["port"]}'},
            {"Origin": self.url + "0"},
            {"Sec-Fetch-Site": "cross-site"},
            {"Sec-Fetch-Site": "same-site"},
            {"Host": "attacker.example"},
            {"Host": self.url.removeprefix("http://") + "/path"},
            {"Host": self.url.removeprefix("http://") + "?x=1"},
            {"Host": self.url.removeprefix("http://") + "#fragment"},
        ):
            with self.subTest(headers=headers):
                response = await self.client.get(
                    self.url + "/api/v1/auth/session", headers=headers
                )
                self.assertEqual(response.status, 403)
                self.assertNotIn("Set-Cookie", response.headers)
        self.assertEqual(len(self.app["pairing"].sessions), 0)

    async def test_same_origin_can_bootstrap(self):
        response = await self.client.get(
            self.url + "/api/v1/auth/session",
            headers={"Origin": self.url, "Sec-Fetch-Site": "same-origin"},
        )
        self.assertEqual(response.status, 200)

    async def test_expired_session_is_replaced_without_pin(self):
        cookie, _ = self.app["pairing"].new_session()
        self.app["pairing"].sessions[cookie] = ("expired", 0)
        response = await self.client.get(
            self.url + "/api/v1/auth/session",
            headers={"Cookie": f"{COOKIE}={cookie}"},
        )
        self.assertEqual(response.status, 200)
        self.assertNotEqual(response.cookies[COOKIE].value, cookie)

    async def test_remote_peer_cannot_bootstrap_even_with_local_host(self):
        request = make_mocked_request(
            "GET",
            "/api/v1/auth/session",
            headers={"Host": f'127.0.0.1:{self.app["port"]}'},
            app=self.app,
        ).clone(remote="192.0.2.1")
        response = await isolation(request, auth_session)
        self.assertEqual(response.status, 403)
        self.assertEqual(len(self.app["pairing"].sessions), 0)


if __name__ == "__main__":
    unittest.main()
