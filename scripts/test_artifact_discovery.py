import asyncio
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from aiohttp import web, ClientSession, CookieJar

sys.path.insert(0, str(Path(__file__).resolve().parent))
from application import create_app

class TestArtifactDiscovery(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.workspace_root = tempfile.mkdtemp()
        self.workspace_dir = Path(self.workspace_root) / "workspace"
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
        # Create specs and plans directories inside workspace
        (self.workspace_dir / "docs" / "superpowers" / "specs").mkdir(parents=True, exist_ok=True)
        (self.workspace_dir / "docs" / "superpowers" / "plans").mkdir(parents=True, exist_ok=True)

        self.app = create_app(data_dir=self.temp_dir, port=0)
        self.app["store"].write("settings", {
            "workspace_roots": [str(self.workspace_dir)],
            "cwd": str(self.workspace_dir)
        })

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
        shutil.rmtree(self.workspace_root, ignore_errors=True)

    async def authenticated(self):
        async with self.client.post(
            self.url + "/api/v1/pair", json={"code": self.app["pairing"].code}
        ) as response:
            csrf = (await response.json())["csrf_token"]
        return {"X-CSRF-Token": csrf}

    async def test_auto_discover_workspace_specs_and_plans(self):
        headers = await self.authenticated()

        # 1. Create a spec file inside workspace
        spec_path = self.workspace_dir / "docs" / "superpowers" / "specs" / "test-spec.md"
        spec_path.write_text("# Test Architecture Spec\n\nThis is a sample spec document.", encoding="utf-8")
        
        # 2. Create a plan file inside workspace
        plan_path = self.workspace_dir / "docs" / "superpowers" / "plans" / "test-plan.md"
        plan_path.write_text("# Test Execution Plan\n\nThis is an execution plan.", encoding="utf-8")

        # 3. Call /api/v1/artifacts
        async with self.client.get(self.url + "/api/v1/artifacts", headers=headers) as resp:
            self.assertEqual(resp.status, 200)
            data = await resp.json()
            self.assertEqual(data.get("status"), "ok")
            artifacts = data.get("artifacts", [])
            
            names = [a.get("name") for a in artifacts]
            self.assertIn("test-spec.md", names)
            self.assertIn("test-plan.md", names)

            # Check synthesized metadata
            spec_art = next(a for a in artifacts if a.get("name") == "test-spec.md")
            self.assertEqual(spec_art.get("summary"), "Test Architecture Spec")
            self.assertTrue(spec_art.get("requestFeedback"))

    async def test_read_auto_discovered_document(self):
        headers = await self.authenticated()
        spec_path = self.workspace_dir / "docs" / "superpowers" / "specs" / "arch.md"
        spec_path.write_text("# My Spec\n\nContent here", encoding="utf-8")

        async with self.client.get(
            self.url + f"/api/v1/artifacts/content?path={spec_path}",
            headers=headers
        ) as resp:
            self.assertEqual(resp.status, 200)
            data = await resp.json()
            self.assertEqual(data.get("name"), "arch.md")
            self.assertIn("# My Spec", data.get("content", ""))

if __name__ == "__main__":
    unittest.main()
