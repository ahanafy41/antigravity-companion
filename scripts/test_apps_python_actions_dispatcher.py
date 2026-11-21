#!/usr/bin/env python3
"""TDD Test for Task 2: Async Python Actions Dispatcher in Antigravity Companion Server."""

import sys
import unittest
from pathlib import Path
from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

REPO_SERVER = Path("/data/data/com.termux/files/home/.antigravity-companion-repo/server")
sys.path.insert(0, str(REPO_SERVER))

import application

class TestAppsPythonActionsDispatcher(AioHTTPTestCase):
    async def get_application(self):
        data_dir = Path("/data/data/com.termux/files/home/.antigravity-server")
        app = application.create_app(data_dir=data_dir, port=7681)
        return app

    @unittest_run_loop
    async def test_apps_action_endpoint(self):
        self.app["port"] = self.server.port
        headers = {
            "Host": f"127.0.0.1:{self.server.port}",
            "Content-Type": "application/json"
        }
        # Whitelisted action ping/test
        payload = {"action": "ping", "params": {"msg": "hello from app"}}
        resp = await self.client.request("POST", "/api/apps/youtube/action", json=payload, headers=headers)
        self.assertEqual(resp.status, 200)
        data = await resp.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("echo"), "hello from app")

if __name__ == "__main__":
    unittest.main()
