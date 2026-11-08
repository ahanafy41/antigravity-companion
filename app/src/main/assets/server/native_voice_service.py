"""Native Antigravity Live Voice Service.

Controls the official Antigravity CLI live voice session running directly
under the user's Google AI Pro subscription, managing tmux process isolation,
PulseAudio audio routing, F6 mute toggling, and Escape session termination.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
import re
import shutil
import time
from typing import Any, Dict, Optional

LOGGER = logging.getLogger("antigravity.native_voice")

TMUX_SESSION_NAME = "agy-native-voice"
DEFAULT_WORKSPACE = "/data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app"


class NativeVoiceService:
    """Manages the lifecycle of an interactive agy voice session."""

    def __init__(self, session_name: str = TMUX_SESSION_NAME, workspace: str = DEFAULT_WORKSPACE):
        self.session_name = session_name
        self.workspace = workspace
        self.voice_chats_dir = Path.home() / ".gemini" / "antigravity-cli" / "voice_chats"

    async def _run_cmd(self, *args: str) -> tuple[int, str, str]:
        """Run an external command and return (returncode, stdout, stderr)."""
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        return (
            proc.returncode or 0,
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace")
        )

    async def ensure_pulseaudio(self) -> bool:
        """Ensure PulseAudio daemon is running for audio input/output."""
        code, out, _ = await self._run_cmd("pulseaudio", "--check")
        if code != 0:
            code, _, _ = await self._run_cmd("pulseaudio", "--start", "--exit-idle-time=-1")
            await asyncio.sleep(0.5)
        return True

    async def is_session_alive(self) -> bool:
        """Check if the tmux session currently exists."""
        code, _, _ = await self._run_cmd("tmux", "has-session", "-t", self.session_name)
        return code == 0

    async def capture_pane(self) -> str:
        """Capture the text content of the tmux pane."""
        if not await self.is_session_alive():
            return ""
        code, out, _ = await self._run_cmd("tmux", "capture-pane", "-t", self.session_name, "-p")
        return out if code == 0 else ""

    async def get_status(self) -> Dict[str, Any]:
        """Inspect the current voice state."""
        alive = await self.is_session_alive()
        if not alive:
            return {
                "active": False,
                "state": "idle",
                "label": "غير متصل",
                "account": "ahmedhanafy884@gmail.com (Google AI Pro)",
                "mic_active": False,
                "elapsed": ""
            }

        pane = await self.capture_pane()
        
        # Check for active Live voice indicators:
        # Example: ● Live 00:08 · muted · f6 unmute · esc hang up
        # Example: ● Live 00:02 · listening · f6 mute · esc hang up
        live_match = re.search(r"Live\s+([0-9:]+)\s*·\s*(listening|muted)", pane)
        if live_match:
            elapsed = live_match.group(1)
            mode = live_match.group(2)
            is_muted = (mode == "muted")
            return {
                "active": True,
                "state": "muted" if is_muted else "listening",
                "label": "المايك مكتوم" if is_muted else "محادثة حية مباشرة - جارٍ الاستماع",
                "account": "ahmedhanafy884@gmail.com (Google AI Pro)",
                "mic_active": not is_muted,
                "elapsed": elapsed
            }

        # Check for dictation recording mode:
        # Example: ○ Recording 00:06  enter or f5 to insert · esc to discard
        rec_match = re.search(r"Recording\s+([0-9:]+)", pane)
        if rec_match:
            return {
                "active": True,
                "state": "recording",
                "label": "تسجيل صوتي لإدخال رسالة",
                "account": "ahmedhanafy884@gmail.com (Google AI Pro)",
                "mic_active": True,
                "elapsed": rec_match.group(1)
            }

        if "Started voice chat" in pane and "Stopped voice chat" not in pane:
            return {
                "active": True,
                "state": "listening",
                "label": "المحادثة الصوتية نشطة",
                "account": "ahmedhanafy884@gmail.com (Google AI Pro)",
                "mic_active": True,
                "elapsed": ""
            }

        return {
            "active": False,
            "state": "ready",
            "label": "جلسة agy جاهزة للاتصال",
            "account": "ahmedhanafy884@gmail.com (Google AI Pro)",
            "mic_active": False,
            "elapsed": ""
        }

    async def start(self) -> Dict[str, Any]:
        """Start or unpause the native Antigravity live voice chat via F6."""
        await self.ensure_pulseaudio()

        alive = await self.is_session_alive()
        if not alive:
            # Spawn a fresh interactive agy session in tmux
            cwd = self.workspace if os.path.isdir(self.workspace) else str(Path.home())
            await self._run_cmd(
                "tmux", "new-session", "-d", "-s", self.session_name, "-c", cwd, "agy"
            )
            # Wait for prompt to appear and TUI to stabilize
            for _ in range(20):
                await asyncio.sleep(0.5)
                pane = await self.capture_pane()
                if ">" in pane:
                    await asyncio.sleep(1.2)  # Allow TUI event loop to settle
                    break

        status = await self.get_status()
        if status.get("state") == "muted":
            # If muted, unmute via F6
            await self._run_cmd("tmux", "send-keys", "-t", self.session_name, "F6")
            await asyncio.sleep(0.8)
            return await self.get_status()

        if status.get("active"):
            return status

        # Send F6 hotkey once to trigger native live voice mode
        await self._run_cmd("tmux", "send-keys", "-t", self.session_name, "F6")
        await asyncio.sleep(1.5)
        status = await self.get_status()
        if status.get("state") == "muted":
            # If it started in muted state, unmute via F6
            await self._run_cmd("tmux", "send-keys", "-t", self.session_name, "F6")
            await asyncio.sleep(0.6)
            return await self.get_status()

        return status

    async def toggle_mute(self) -> Dict[str, Any]:
        """Toggle microphone mute state using F6."""
        if not await self.is_session_alive():
            return await self.get_status()
        await self._run_cmd("tmux", "send-keys", "-t", self.session_name, "F6")
        await asyncio.sleep(0.5)
        return await self.get_status()

    async def stop(self) -> Dict[str, Any]:
        """Hang up the voice chat using Escape."""
        if not await self.is_session_alive():
            return await self.get_status()
        await self._run_cmd("tmux", "send-keys", "-t", self.session_name, "Escape")
        await asyncio.sleep(0.8)
        return await self.get_status()

    async def get_latest_transcript(self, limit: int = 15) -> list[dict]:
        """Return the latest spoken lines from voice_chats directory."""
        if not self.voice_chats_dir.exists():
            return []
        try:
            files = sorted(
                self.voice_chats_dir.glob("*.json"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if not files:
                return []
            latest_file = files[0]
            data = json.loads(latest_file.read_text(encoding="utf-8"))
            chats = data.get("chats", [])
            if not chats:
                return []
            latest_chat = chats[-1]
            lines = latest_chat.get("lines", [])
            return lines[-limit:]
        except Exception as e:
            LOGGER.warning("Could not read voice transcript: %s", e)
            return []
