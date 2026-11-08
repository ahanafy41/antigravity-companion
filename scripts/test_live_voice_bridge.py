import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

async def test_live_voice_websocket():
    from application import create_app
    from aiohttp import web, ClientSession, CookieJar
    import tempfile
    
    with tempfile.TemporaryDirectory() as tmpdir:
        app = create_app(Path(tmpdir), 0)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        app["port"] = port
        client = ClientSession(cookie_jar=CookieJar(unsafe=True))
        try:
            # Pair
            pair_resp = await client.post(
                f"http://127.0.0.1:{port}/api/v1/pair",
                json={"code": app["pairing"].code}
            )
            assert pair_resp.status == 200, f"Pairing failed: {pair_resp.status}"
            pair_data = await pair_resp.json()
            csrf_token = pair_data.get("csrf_token", "")

            # 1. Fetch voice catalog
            cat_resp = await client.get(f"http://127.0.0.1:{port}/api/v1/voice/catalog")
            assert cat_resp.status == 200, f"Catalog failed: {cat_resp.status}"
            cat_data = await cat_resp.json()
            assert "voices" in cat_data, "Expected voices list"
            assert len(cat_data["voices"]) >= 8, f"Expected at least 8 voices, got {len(cat_data['voices'])}"
            assert "active_voice" in cat_data, "Expected active_voice"
            
            # Verify required voices exist
            voice_names = {v["name"] for v in cat_data["voices"]}
            for req in ["Charon", "Puck", "Fenrir", "Orus", "Aoede", "Kore", "Leda", "Zephyr"]:
                assert req in voice_names, f"Expected voice {req} in catalog"

            # 2. Select a voice with CSRF token
            headers = {
                "X-CSRF-Token": csrf_token,
                "Origin": f"http://127.0.0.1:{port}"
            } if csrf_token else {}
            sel_resp = await client.post(
                f"http://127.0.0.1:{port}/api/v1/voice/select",
                headers=headers,
                json={"voice": "Charon"}
            )
            assert sel_resp.status == 200, f"Voice select failed: {sel_resp.status}"
            sel_data = await sel_resp.json()
            assert sel_data.get("success") is True, f"Select not successful: {sel_data}"
            assert sel_data.get("active_voice") == "Charon", f"Expected active Charon, got {sel_data.get('active_voice')}"

            print("Voice catalog and selection tests passed.")
        finally:
            await client.close()
            await runner.cleanup()

if __name__ == "__main__":
    try:
        asyncio.run(test_live_voice_websocket())
        print("ALL LIVE VOICE BRIDGE TESTS PASSED")
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
