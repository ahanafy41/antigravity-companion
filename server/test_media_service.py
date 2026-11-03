import asyncio
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from aiohttp import web, ClientSession, CookieJar

sys.path.insert(0, str(Path(__file__).resolve().parent))
from application import create_app

class TestMediaService(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.workspace_root = tempfile.mkdtemp()
        self.workspace_dir = Path(self.workspace_root) / "workspace"
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
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
            data = await response.json()
            csrf = data["csrf_token"]
        return csrf

    async def test_stream_media_file_with_token_and_range(self):
        csrf = await self.authenticated()
        
        # 1. Create a dummy audio/video binary file
        media_file = self.workspace_dir / "sample_audio.mp3"
        content = b"ID3\x03\x00\x00\x00" + (b"0123456789" * 100) # 1007 bytes
        media_file.write_bytes(content)

        # 2. Test request with token parameter and Range header
        stream_url = f"{self.url}/api/v1/files/raw?path={media_file}&token={csrf}"
        headers = {"Range": "bytes=0-49"}
        
        # Use a new unauthenticated session to simulate <audio> tag loading with ?token=...
        async with ClientSession() as media_client:
            async with media_client.get(stream_url, headers=headers) as resp:
                self.assertEqual(resp.status, 206) # Partial Content
                self.assertIn("audio/", resp.headers.get("Content-Type", "").lower())
                body = await resp.read()
                self.assertEqual(len(body), 50)
                self.assertEqual(body, content[:50])

    async def test_path_traversal_blocked(self):
        csrf = await self.authenticated()
        outside_file = Path(self.temp_dir) / "secret.txt"
        outside_file.write_text("secret!", encoding="utf-8")

        stream_url = f"{self.url}/api/v1/files/raw?path={outside_file}&token={csrf}"
        async with ClientSession() as media_client:
            async with media_client.get(stream_url) as resp:
                self.assertEqual(resp.status, 403)

if __name__ == "__main__":
    unittest.main()
