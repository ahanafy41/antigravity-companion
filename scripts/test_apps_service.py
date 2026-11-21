import asyncio
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from aiohttp import web, ClientSession, CookieJar

# Add server directory to path
server_dir = Path(__file__).resolve().parent.parent / "server"
sys.path.insert(0, str(server_dir))
from application import create_app
import apps_service

class TestAppsServiceAndApi(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.app = create_app(data_dir=self.temp_dir, port=0)
        self.runner = web.AppRunner(self.app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        self.app["port"] = self.port
        self.client = ClientSession(cookie_jar=CookieJar(unsafe=True))
        self.url = f"http://127.0.0.1:{self.port}"

    async def asyncTearDown(self):
        await self.client.close()
        await self.runner.cleanup()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    async def authenticated(self):
        async with self.client.post(
            self.url + "/api/v1/pair", json={"code": self.app["pairing"].code}
        ) as response:
            csrf = (await response.json())["csrf_token"]
        return {"X-CSRF-Token": csrf}

    async def test_apps_crud_flow_and_security(self):
        headers = await self.authenticated()

        # 1. Initial list must be empty
        async with self.client.get(self.url + "/api/apps", headers=headers) as resp:
            self.assertEqual(resp.status, 200)
            data = await resp.json()
            self.assertEqual(data.get("apps"), [])

        # 2. Invalid app ID rejection (special characters or traversal)
        async with self.client.get(self.url + "/api/apps/invalid!id@name", headers=headers) as resp:
            self.assertEqual(resp.status, 400)
            err_data = await resp.json()
            self.assertEqual(err_data.get("code"), "invalid_id")

        # 3. Create a valid app
        app_payload = {
            "title": "حاسبة زكاة المال",
            "description": "حاسبة تفاعلية صوتية",
            "code": "<div>حاسبة الزكاة</div><script>console.log('calc');</script>"
        }
        async with self.client.post(self.url + "/api/apps", json=app_payload, headers=headers) as resp:
            self.assertEqual(resp.status, 201)
            created = await resp.json()
            app_id = created.get("id")
            self.assertTrue(app_id)
            self.assertEqual(created.get("title"), "حاسبة زكاة المال")

        # 4. Verify app listed in /api/apps (O(1) index read)
        async with self.client.get(self.url + "/api/apps", headers=headers) as resp:
            self.assertEqual(resp.status, 200)
            data = await resp.json()
            apps = data.get("apps", [])
            self.assertEqual(len(apps), 1)
            self.assertEqual(apps[0]["id"], app_id)
            self.assertEqual(apps[0]["title"], "حاسبة زكاة المال")
            self.assertNotIn("code", apps[0], "List response must be lightweight without full code")

        # 5. Fetch full app with code
        async with self.client.get(f"{self.url}/api/apps/{app_id}", headers=headers) as resp:
            self.assertEqual(resp.status, 200)
            full_app = await resp.json()
            self.assertEqual(full_app["id"], app_id)
            self.assertEqual(full_app["code"], app_payload["code"])

        # 6. Delete app
        async with self.client.delete(f"{self.url}/api/apps/{app_id}", headers=headers) as resp:
            self.assertEqual(resp.status, 200)
            del_res = await resp.json()
            self.assertEqual(del_res.get("status"), "deleted")

        # 7. Verify deletion
        async with self.client.get(f"{self.url}/api/apps/{app_id}", headers=headers) as resp:
            self.assertEqual(resp.status, 404)

        async with self.client.get(self.url + "/api/apps", headers=headers) as resp:
            self.assertEqual(resp.status, 200)
            data = await resp.json()
            self.assertEqual(data.get("apps"), [])

    async def test_csrf_protection_on_mutations(self):
        # 1. Unauthenticated mutation returns 401
        app_payload = {"title": "تطبيق تجريبي", "code": "<p>test</p>"}
        async with self.client.post(self.url + "/api/apps", json=app_payload) as resp:
            self.assertEqual(resp.status, 401)

        # 2. Authenticated mutation with invalid CSRF token returns 403
        await self.authenticated()  # Sets cookie in jar
        invalid_headers = {"X-CSRF-Token": "completely_fake_token"}
        async with self.client.post(self.url + "/api/apps", json=app_payload, headers=invalid_headers) as resp:
            self.assertEqual(resp.status, 403)
            data = await resp.json()
            self.assertEqual(data.get("code"), "csrf_failed")

if __name__ == "__main__":
    unittest.main()
