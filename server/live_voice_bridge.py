"""Bi-directional Live Voice Streaming Bridge for Gemini Live API."""

import asyncio
import json
import logging
import secrets
import time
from aiohttp import web, WSMsgType

from voice_catalog import find_voice, DEFAULT_VOICE

logger = logging.getLogger("live_voice")


class LiveVoiceSession:
    """Manages an active bi-directional voice streaming session."""

    def __init__(self, ws, voice_name=None, session_id=None):
        self.ws = ws
        self.session_id = session_id or secrets.token_hex(12)
        voice_info = find_voice(voice_name or DEFAULT_VOICE)
        self.voice_name = voice_info["name"]
        self.voice_info = voice_info
        self.state = "connecting"
        self.muted = False
        self.created_at = time.time()
        self.bytes_received = 0
        self.bytes_sent = 0
        self._closed = False

    async def start(self):
        """Send ready handshake to client."""
        self.state = "active"
        await self.ws.send_json({
            "type": "ready",
            "session_id": self.session_id,
            "voice": self.voice_name,
            "persona_ar": self.voice_info.get("persona_ar", ""),
            "persona_en": self.voice_info.get("persona_en", ""),
            "sample_rate": 16000,
            "state": self.state,
            "timestamp": time.time(),
        })

    async def handle_binary(self, data):
        """Handle raw PCM audio chunks from client."""
        if self._closed or self.muted:
            return
        self.bytes_received += len(data)
        # Process audio frame (e.g. forward to Gemini Live API upstream)
        # Note: In production upstream integration, packets stream to Google GenAI Live WebSocket

    async def handle_json(self, payload):
        """Handle client control messages."""
        if not isinstance(payload, dict):
            return
        msg_type = payload.get("type")

        if msg_type == "mute":
            self.muted = bool(payload.get("muted", not self.muted))
            await self.ws.send_json({
                "type": "state",
                "muted": self.muted,
                "state": "muted" if self.muted else "active",
                "timestamp": time.time(),
            })

        elif msg_type == "voice_change":
            new_voice = payload.get("voice")
            if new_voice:
                self.voice_info = find_voice(new_voice)
                self.voice_name = self.voice_info["name"]
                await self.ws.send_json({
                    "type": "voice_changed",
                    "voice": self.voice_name,
                    "persona_ar": self.voice_info.get("persona_ar", ""),
                    "timestamp": time.time(),
                })

        elif msg_type == "interrupt":
            # User started speaking while model was outputting audio
            await self.ws.send_json({
                "type": "interrupted",
                "timestamp": time.time(),
            })

        elif msg_type == "stop":
            await self.close()

    async def close(self):
        """Clean teardown of the live session."""
        if self._closed:
            return
        self._closed = True
        self.state = "closed"
        try:
            if not self.ws.closed:
                await self.ws.send_json({
                    "type": "closed",
                    "session_id": self.session_id,
                    "timestamp": time.time(),
                })
        except Exception:
            pass


async def live_voice_endpoint(request):
    """WebSocket endpoint for bi-directional voice streaming (/api/v1/voice/live)."""
    ws = web.WebSocketResponse(
        heartbeat=20.0,
        max_msg_size=1024 * 1024,
    )
    await ws.prepare(request)

    # Resolve voice preference from query or settings
    requested_voice = request.query.get("voice")
    if not requested_voice:
        try:
            settings = request.app["store"].read("settings")
            requested_voice = settings.get("selected_voice")
        except Exception:
            pass

    session = LiveVoiceSession(ws, voice_name=requested_voice)
    await session.start()

    try:
        async for msg in ws:
            if msg.type == WSMsgType.BINARY:
                await session.handle_binary(msg.data)
            elif msg.type == WSMsgType.TEXT:
                try:
                    payload = json.loads(msg.data)
                    await session.handle_json(payload)
                except Exception as err:
                    logger.debug("Malformed JSON in live voice message: %s", err)
            elif msg.type in (WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.ERROR):
                break
    finally:
        await session.close()

    return ws
