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

logger = logging.getLogger("live_voice")

VERIFIED_VOICES = {v["name"] for v in PREBUILT_VOICES}

LIVE_API_HOST = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)


def generate_chime_pcm(duration_s: float = 0.30, sample_rate: int = 24000) -> bytes:
    """Generate a single clean 24kHz harmonic chime confirming live stream connection."""
    num_samples = int(duration_s * sample_rate)
    pcm = bytearray()
    for i in range(num_samples):
        t = i / sample_rate
        # Fast exponential decay envelope
        env = min(1.0, t * 80.0) * math.exp(-8.0 * t)
        # Gentle harmonic chord: C5 (523Hz) + G5 (784Hz)
        sample = (
            0.60 * math.sin(2 * math.pi * 523.25 * t) +
            0.40 * math.sin(2 * math.pi * 783.99 * t)
        ) * env
        val = int(max(-1.0, min(1.0, sample)) * 26000)
        pcm.extend(struct.pack("<h", val))
    return bytes(pcm)


def calculate_pcm_rms(data: bytes) -> float:
    """Fast sampling RMS calculator for 16kHz 16-bit mono PCM."""
    if len(data) < 2:
        return 0.0
    count = len(data) // 2
    step = max(1, count // 64)
    sum_sq = 0
    sampled = 0
    for i in range(0, count, step):
        val = struct.unpack_from("<h", data, i * 2)[0]
        sum_sq += val * val
        sampled += 1
    if sampled == 0:
        return 0.0
    return math.sqrt(sum_sq / sampled) / 32768.0


class LiveVoiceSession:
    """Manages an active bi-directional voice streaming session with VAD and Gemini Live."""

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
        # VAD & Turn State
        self.has_spoken = False
        self.last_speech_time = 0.0
        self.vad_silence_timer = None
        self.turn_in_progress = False

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
        """Send ready handshake to client, transmit single chime, and connect upstream."""
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

        # 2. Play acoustic confirmation chime (SINGLE BINARY STREAM - No duplicate JSON)
        try:
            chime_bytes = generate_chime_pcm()
            await self.ws.send_bytes(chime_bytes)
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

            # Wait for setup acknowledgment from Gemini Live
            first_resp = await asyncio.wait_for(self.upstream_ws.receive(), timeout=10.0)
            logger.info("Gemini Live API connected and setup confirmed: %s", first_resp.type)

            # Send proactive greeting so user immediately hears model voice
            greeting_turn = {
                "clientContent": {
                    "turns": [
                        {
                            "role": "user",
                            "parts": [
                                {
                                    "text": "مرحباً يا أحمد! أنا أنتيجرافيتي، جاهز أسمعك وأساعدك صوتياً."
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
                        # Stream audio output (SINGLE BINARY STREAM - No duplicate JSON)
                        model_turn = server_content.get("modelTurn")
                        if model_turn and "parts" in model_turn:
                            for part in model_turn["parts"]:
                                inline_data = part.get("inlineData")
                                if inline_data and inline_data.get("mimeType", "").startswith("audio/"):
                                    pcm_bytes = base64.b64decode(inline_data["data"])
                                    if not self.ws.closed:
                                        await self.ws.send_bytes(pcm_bytes)
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

                        # Turn completion
                        if server_content.get("turnComplete"):
                            self.turn_in_progress = False
                            if not self.ws.closed:
                                await self.ws.send_json({"type": "turn_complete"})

                        # Interruption / Barge-in acknowledgment
                        if server_content.get("interrupted") and not self.ws.closed:
                            self.turn_in_progress = False
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
        """Handle raw PCM audio chunks from client, run VAD, and forward upstream."""
        if self._closed or self.muted:
            return
        self.bytes_received += len(data)

        # 1. Forward 16kHz PCM audio chunk to upstream Gemini Live API
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

        # 2. Server-side VAD (Voice Activity Detection): trigger turnComplete upon speech pause
        rms = calculate_pcm_rms(data)
        now = time.time()
        if rms > 0.02:
            # Active human speech detected
            self.has_spoken = True
            self.last_speech_time = now
        elif self.has_spoken and (now - self.last_speech_time > 0.65):
            # User finished speaking and paused for 650ms: send turnComplete!
            self.has_spoken = False
            self.turn_in_progress = True
            if self.upstream_ws and not self.upstream_ws.closed:
                try:
                    await self.upstream_ws.send_str(json.dumps({
                        "clientContent": {
                            "turnComplete": True
                        }
                    }))
                    if not self.ws.closed:
                        await self.ws.send_json({
                            "type": "state",
                            "state": "thinking"
                        })
                except Exception as err:
                    logger.debug("Error sending turnComplete: %s", err)

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
            self.has_spoken = True
            self.last_speech_time = time.time()
            if self.upstream_ws and not self.upstream_ws.closed:
                try:
                    # Immediately notify upstream of interruption
                    pass
                except Exception:
                    pass
            await self.ws.send_json({
                "type": "interrupted",
                "timestamp": time.time(),
            })

        elif msg_type == "turn_end":
            # Explicit Push-to-Talk or client-side VAD turn completion
            if self.upstream_ws and not self.upstream_ws.closed:
                try:
                    await self.upstream_ws.send_str(json.dumps({
                        "clientContent": {
                            "turnComplete": True
                        }
                    }))
                except Exception:
                    pass

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
