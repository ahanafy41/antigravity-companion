import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

async def test_live_voice_websocket():
    from application import create_app
    from aiohttp import web, ClientSession, CookieJar, WSMsgType
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

            # Connect to live voice websocket
            ws_url = f"http://127.0.0.1:{port}/api/v1/voice/live?voice=Charon"
            ws = await client.ws_connect(ws_url)
            
            # First message should be ready handshake
            msg = await ws.receive_json(timeout=5)
            assert msg.get("type") == "ready", f"Expected ready message, got {msg}"
            assert msg.get("voice") == "Charon", f"Expected voice Charon, got {msg.get('voice')}"
            
            # Send sample PCM audio chunk (16-bit PCM silence: 320 bytes = 10ms at 16kHz)
            dummy_pcm = b"\x00" * 320
            await ws.send_bytes(dummy_pcm)
            
            # Send text / control message
            await ws.send_json({"type": "mute", "muted": True})
            ack = await ws.receive_json(timeout=5)
            assert ack.get("type") == "state", f"Expected state update, got {ack}"
            assert ack.get("muted") is True, "Expected muted to be True"
            
            # Close cleanly
            await ws.close()
            print("WebSocket live voice tests passed.")
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
