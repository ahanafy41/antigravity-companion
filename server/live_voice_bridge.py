"""Bi-directional Live Voice Streaming Bridge for Gemini Live API & Companion WebUI."""

import asyncio
import base64
import json
import logging
import math
import os
from pathlib import Path
import secrets
import struct
import time
from aiohttp import web, WSMsgType, ClientSession

from voice_catalog import find_voice, DEFAULT_VOICE, PREBUILT_VOICES

VERIFIED_VOICES = {v["name"] for v in PREBUILT_VOICES}

logger = logging.getLogger("live_voice")

LIVE_API_HOST = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)


def generate_chime_pcm(duration_s: float = 0.35, sample_rate: int = 24000) -> bytes:
    """Generate a high-quality 24kHz harmonic chime confirming live stream connection."""
    num_samples = int(duration_s * sample_rate)
    pcm = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        # Fast exponential decay envelope
        env = min(1.0, t * 60.0) * math.exp(-7.0 * t)
        # Rising harmonic chord: C5 (523Hz) + G5 (784Hz) + C6 (1046Hz)
        sample = (
            0.50 * math.sin(2 * math.pi * 523.25 * t) +
            0.30 * math.sin(2 * math.pi * 783.99 * t) +
            0.20 * math.sin(2 * math.pi * 1046.50 * t)
        ) * env
        val = int(max(-1.0, min(1.0, sample)) * 32767)
        pcm.extend(struct.pack("<h", val))
    return bytes(pcm)


class LiveVoiceSession:
    """Manages an active bi-directional voice streaming session."""

    def __init__(self, ws, voice_name=None, session_id=None, app=None):
        self.ws = ws
        self.app = app
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
        self.upstream_ws = None
        self.upstream_session = None
        self.upstream_task = None

    def get_api_key(self) -> str | None:
        """Find Gemini API key from store, settings file, or environment."""
        if self.app and "store" in self.app:
            try:
                settings = self.app["store"].read("settings")
                k = settings.get("gemini_api_key")
                if k and isinstance(k, str) and k.strip():
                    return k.strip()
            except Exception:
                pass

        settings_file = Path.home() / ".antigravity-server" / "settings.json"
        if settings_file.exists():
            try:
                doc = json.loads(settings_file.read_text(encoding="utf-8"))
                k = doc.get("gemini_api_key")
                if k and isinstance(k, str) and k.strip():
                    return k.strip()
            except Exception:
                pass

        for env_var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
            val = os.environ.get(env_var)
            if val and val.strip():
                return val.strip()

        return None

    async def start(self):
        """Send ready handshake to client, transmit chime audio, and connect upstream."""
        self.state = "active"
        api_key = self.get_api_key()

        # 1. Send JSON ready message
        await self.ws.send_json({
            "type": "ready",
            "session_id": self.session_id,
            "voice": self.voice_name,
            "persona_ar": self.voice_info.get("persona_ar", ""),
            "persona_en": self.voice_info.get("persona_en", ""),
            "sample_rate": 16000,
            "playback_sample_rate": 24000,
            "state": self.state,
            "has_api_key": bool(api_key),
            "timestamp": time.time(),
        })

        # 2. Play acoustic confirmation chime (both raw binary & JSON base64 for universal compatibility)
        try:
            chime_bytes = generate_chime_pcm()
            await self.ws.send_bytes(chime_bytes)
            await self.ws.send_json({
                "type": "audio",
                "data": base64.b64encode(chime_bytes).decode("ascii"),
                "sample_rate": 24000,
                "kind": "chime"
            })
            self.bytes_sent += len(chime_bytes)
        except Exception as e:
            logger.debug("Could not transmit initial chime: %s", e)

        # 3. Start upstream Gemini Live connection if API key is configured
        if api_key:
            self.upstream_task = asyncio.create_task(self._connect_upstream(api_key))

    async def _connect_upstream(self, api_key: str):
        """Establish upstream Gemini Live WebSocket session."""
        try:
            url = f"{LIVE_API_HOST}?key={api_key}"
            self.upstream_session = ClientSession()
            self.upstream_ws = await self.upstream_session.ws_connect(url, heartbeat=15.0)

            setup_msg = {
                "setup": {
                    "model": "models/gemini-3.8-live",
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {
                                    "voiceName": self.voice_name
                                }
                            }
                        }
                    },
                    "systemInstruction": {
                        "parts": [
                            {
                                "text": (
                                    "أنت المساعد الصوتي التقني المباشر لوكيل أنتيجرافيتي (Antigravity Companion). "
                                    "تتحدث بلهجة مصرية ودودة جداً ومختصرة ومريحة للمطور أحمد. "
                                    "رحّب به بجملة واحدة ودودة ومختصرة بالعامية المصرية وأخبره أنك جاهز لمساعدته."
                                )
                            }
                        ]
                    }
                }
            }
            await self.upstream_ws.send_str(json.dumps(setup_msg))

            # Initial greeting turn
            greeting_turn = {
                "clientContent": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [
                                {
                                    "text": "مرحباً! رحب بالمطور أحمد بلهجة مصرية ودودة ومختصرة في جملة واحدة."
                                }
                            ]
                        }
                    ],
                    "turnComplete": True
                }
            }
            await self.upstream_ws.send_str(json.dumps(greeting_turn))

            # Upstream message reader loop
            async for msg in self.upstream_ws:
                if self._closed or self.ws.closed:
                    break
                if msg.type in (WSMsgType.TEXT, WSMsgType.BINARY):
                    raw_str = msg.data.decode("utf-8") if isinstance(msg.data, (bytes, bytearray)) else msg.data
                    try:
                        data = json.loads(raw_str)
                    except Exception:
                        continue

                    server_content = data.get("serverContent")
                    if server_content:
                        # Stream audio output
                        model_turn = server_content.get("modelTurn")
                        if model_turn and "parts" in model_turn:
                            for part in model_turn["parts"]:
                                inline_data = part.get("inlineData")
                                if inline_data and inline_data.get("mimeType", "").startswith("audio/"):
                                    pcm_b64 = inline_data["data"]
                                    pcm_bytes = base64.b64decode(pcm_b64)
                                    if not self.ws.closed:
                                        await self.ws.send_bytes(pcm_bytes)
                                        await self.ws.send_json({
                                            "type": "audio",
                                            "data": pcm_b64,
                                            "sample_rate": 24000
                                        })
                                        self.bytes_sent += len(pcm_bytes)

                        # Output transcription
                        out_tx = server_content.get("outputTranscription")
                        if out_tx and out_tx.get("text") and not self.ws.closed:
                            await self.ws.send_json({
                                "type": "transcript",
                                "sender": "model",
                                "text": out_tx["text"]
                            })

                        # Input transcription
                        in_tx = server_content.get("inputTranscription")
                        if in_tx and in_tx.get("text") and not self.ws.closed:
                            await self.ws.send_json({
                                "type": "transcript",
                                "sender": "user",
                                "text": in_tx["text"]
                            })

                        # Interruption / Barge-in acknowledgment
                        if server_content.get("interrupted") and not self.ws.closed:
                            await self.ws.send_json({"type": "interrupted"})

                elif msg.type in (WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.ERROR):
                    break

        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.debug("Upstream Live API exception: %s", err)
            if not self.ws.closed:
                await self.ws.send_json({
                    "type": "upstream_status",
                    "status": "offline_fallback",
                    "message": str(err)
                })

    async def handle_binary(self, data: bytes):
        """Handle raw PCM audio chunks from client and forward upstream."""
        if self._closed or self.muted:
            return
        self.bytes_received += len(data)

        # Forward 16kHz PCM audio chunk to upstream Gemini Live API if connected
        if self.upstream_ws and not self.upstream_ws.closed:
            try:
                audio_b64 = base64.b64encode(data).decode("ascii")
                payload = {
                    "realtimeInput": {
                        "mediaChunks": [
                            {
                                "mimeType": "audio/pcm;rate=16000",
                                "data": audio_b64
                            }
                        ]
                    }
                }
                await self.upstream_ws.send_str(json.dumps(payload))
            except Exception as err:
                logger.debug("Error forwarding audio upstream: %s", err)

    async def handle_json(self, payload: dict):
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
            # Barge-in signal from client
            if self.upstream_ws and not self.upstream_ws.closed:
                try:
                    # Client interrupted turn
                    pass
                except Exception:
                    pass
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

        if self.upstream_task and not self.upstream_task.done():
            self.upstream_task.cancel()

        if self.upstream_ws and not self.upstream_ws.closed:
            try:
                await self.upstream_ws.close()
            except Exception:
                pass

        if self.upstream_session and not self.upstream_session.closed:
            try:
                await self.upstream_session.close()
            except Exception:
                pass

        try:
            if not self.ws.closed:
                await self.ws.send_json({
                    "type": "closed",
                    "session_id": self.session_id,
                    "timestamp": time.time(),
                })
        except Exception:
            pass


async def live_voice_endpoint(request: web.Request) -> web.WebSocketResponse:
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

    session = LiveVoiceSession(ws, voice_name=requested_voice, app=request.app)
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
