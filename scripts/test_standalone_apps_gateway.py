#!/usr/bin/env python3
"""TDD Test for Task 1: Standalone Apps HTTP Gateway on Antigravity Companion Server."""

import sys
import unittest
from pathlib import Path
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, unittest_run_loop

REPO_SERVER = Path("/data/data/com.termux/files/home/.antigravity-companion-repo/server")
sys.path.insert(0, str(REPO_SERVER))

import application

class TestStandaloneAppsGateway(AioHTTPTestCase):
    async def get_application(self):
        data_dir = Path("/data/data/com.termux/files/home/.antigravity-server")
        app = application.create_app(data_dir=data_dir, port=7681)
        return app

    @unittest_run_loop
    async def test_apps_endpoint_serves_html(self):
        # We ensure request.app['port'] matches our test server port
        self.app["port"] = self.server.port
        headers = {"Host": f"127.0.0.1:{self.server.port}"}
        resp = await self.client.request("GET", "/apps/calculator.html", headers=headers)
        self.assertEqual(resp.status, 200)
        self.assertIn("text/html", resp.headers.get("Content-Type", ""))
        text = await resp.text()
        self.assertIn("<html", text.lower())

if __name__ == "__main__":
    unittest.main()
