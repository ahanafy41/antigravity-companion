"""Test suite for NativeVoiceService."""

import asyncio
import sys
from pathlib import Path

# Add server to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from native_voice_service import NativeVoiceService


async def test_native_voice_lifecycle():
    service = NativeVoiceService(session_name="test-native-voice-suite")
    print("[1] Ensuring clean state...")
    await service._run_cmd("tmux", "kill-session", "-t", service.session_name)
    
    status0 = await service.get_status()
    print("[2] Initial status:", status0)
    assert status0["active"] is False
    assert status0["state"] == "idle"
    
    print("[3] Starting native voice session via F6...")
    status1 = await service.start()
    print("[4] Started status:", status1)
    assert await service.is_session_alive()
    
    print("[5] Waiting 2.5 seconds for live connection...")
    await asyncio.sleep(2.5)
    status2 = await service.get_status()
    print("[6] Live status:", status2)
    assert status2["active"] is True
    assert status2["state"] == "listening"
    assert status2["mic_active"] is True
    
    print("[7] Testing toggle mute (F6)...")
    status3 = await service.toggle_mute()
    print("[8] Muted status:", status3)
    assert status3["state"] == "muted"
    assert status3["mic_active"] is False
    
    print("[9] Testing unmute (F6)...")
    status4 = await service.toggle_mute()
    print("[10] Unmuted status:", status4)
    assert status4["state"] == "listening"
    assert status4["mic_active"] is True
    
    print("[11] Testing stop (Escape)...")
    status5 = await service.stop()
    print("[12] Stopped status:", status5)
    assert status5["active"] is False or status5["state"] in ("ready", "idle")
    
    print("[13] Cleaning up test session...")
    await service._run_cmd("tmux", "kill-session", "-t", service.session_name)
    print("ALL TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(test_native_voice_lifecycle())
