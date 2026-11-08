import asyncio
import sys
from pathlib import Path

# Add server to path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

def test_module_import():
    try:
        from voice_catalog import get_voice_catalog, DEFAULT_VOICE, PREBUILT_VOICES
    except ImportError as e:
        print(f"FAILED: Cannot import voice_catalog: {e}", file=sys.stderr)
        sys.exit(1)

    catalog = get_voice_catalog()
    assert len(catalog) == 30, f"Expected 30 voices, got {len(catalog)}"
    assert DEFAULT_VOICE == "Puck", f"Expected default voice 'Puck', got '{DEFAULT_VOICE}'"
    
    # Check essential voices exist
    essential_names = ["Puck", "Charon", "Zephyr", "Kore", "Fenrir", "Aoede", "Orus", "Leda"]
    voice_names = [v["name"] for v in catalog]
    for name in essential_names:
        assert name in voice_names, f"Missing voice {name} in catalog"
        
    for item in catalog:
        assert "id" in item, "Missing id in voice item"
        assert "name" in item, "Missing name in voice item"
        assert "persona_ar" in item, "Missing persona_ar in voice item"
        assert "persona_en" in item, "Missing persona_en in voice item"
        assert "gender" in item, "Missing gender in voice item"
        assert "pitch" in item, "Missing pitch in voice item"

    print("Voice catalog unit tests passed.")

async def test_endpoint():
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
            # Pair first
            pair_resp = await client.post(
                f"http://127.0.0.1:{port}/api/v1/pair",
                json={"code": app["pairing"].code}
            )
            assert pair_resp.status == 200, f"Pairing failed: {pair_resp.status}"

            resp = await client.get(f"http://127.0.0.1:{port}/api/v1/voice/catalog")
            assert resp.status == 200, f"Expected 200, got {resp.status}"
            data = await resp.json()
            assert "voices" in data, "Response missing 'voices' field"
            assert "default" in data, "Response missing 'default' field"
            assert len(data["voices"]) == 30, f"Expected 30 voices in endpoint, got {len(data['voices'])}"
            print("Voice catalog endpoint tests passed.")
        finally:
            await client.close()
            await runner.cleanup()

if __name__ == "__main__":
    try:
        test_module_import()
        asyncio.run(test_endpoint())
        print("ALL VOICE CATALOG TESTS PASSED")
    except AssertionError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
