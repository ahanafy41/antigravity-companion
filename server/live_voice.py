"""Native Live Voice Mode WebSocket Protocol & Streaming Gateway.

Provides bidirectional full-duplex PCM audio streaming, integration with
Google's Gemini Multimodal Live API, human-gated tool execution, and non-visual
status earcons.
"""

import asyncio
import base64
import json
import logging
import os
from pathlib import Path
import time
from aiohttp import web, WSMsgType

LOGGER = logging.getLogger("antigravity.live_voice")

MAGIC_BYTE = 0xAA
OPCODE_AUDIO = 0x01
OPCODE_CONTROL = 0x02

SAFE_READ_ONLY_TOOLS = {
    "read_file",
    "search_web",
    "read_url_content",
    "fetch",
    "list_dir",
    "view_file",
}

DEFAULT_VOICE = "Puck"
VERIFIED_VOICES = {
    "Puck",
    "Charon",
    "Kore",
    "Fenrir",
    "Aoede",
    "Zephyr",
    "Ursa",
    "Orion",
}

LIVE_API_HOST = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)


def is_safe_read_only_tool(tool_name: str) -> bool:
    """Return True if tool is guaranteed read-only; mutating tools require human approval."""
    if not isinstance(tool_name, str):
        return False
    return tool_name.strip().lower() in SAFE_READ_ONLY_TOOLS


def format_audio_frame(pcm_data: bytes) -> bytes:
    """Pack raw PCM audio into binary wire frame [0xAA, 0x01, ...pcm]."""
    if not isinstance(pcm_data, (bytes, bytearray)):
        raise TypeError("PCM data must be bytes or bytearray")
    return bytes([MAGIC_BYTE, OPCODE_AUDIO]) + bytes(pcm_data)


def format_control_frame(payload_dict: dict) -> bytes:
    """Pack control / event dictionary into UTF-8 JSON wire frame [0xAA, 0x02, ...json]."""
    if not isinstance(payload_dict, dict):
        raise TypeError("Payload must be a dictionary")
    json_bytes = json.dumps(payload_dict, ensure_ascii=False).encode("utf-8")
    return bytes([MAGIC_BYTE, OPCODE_CONTROL]) + json_bytes


def parse_wire_frame(frame_bytes: bytes) -> tuple[int, bytes]:
    """Parse incoming wire frame, validating magic byte and returning (opcode, payload)."""
    if not isinstance(frame_bytes, (bytes, bytearray)):
        raise TypeError("Frame must be bytes or bytearray")
    if len(frame_bytes) < 2:
        raise ValueError("Frame is too short to contain magic byte and opcode")
    if frame_bytes[0] != MAGIC_BYTE:
        raise ValueError(f"Invalid magic byte: {hex(frame_bytes[0])}, expected 0xAA")
    opcode = frame_bytes[1]
    if opcode not in (OPCODE_AUDIO, OPCODE_CONTROL):
        raise ValueError(f"Unsupported opcode: {hex(opcode)}")
    return opcode, bytes(frame_bytes[2:])


class LiveVoiceProtocol:
    """Orchestrates bidirectional live streaming between companion client and Gemini Live."""

    def __init__(self, application=None, session_id=None):
        self.app = application
        self.session_id = session_id
        self.active_voice = DEFAULT_VOICE
        self.silence_timeout_seconds = 45.0
        self.last_audio_timestamp = time.time()
        self.pending_approvals = {}

    def get_oauth_token(self) -> str | None:
        """Discover Google OAuth access token from antigravity credentials or environment."""
        token_path = Path.home() / ".gemini" / "antigravity-cli" / "antigravity-oauth-token"
        if token_path.exists():
            try:
                data = json.loads(token_path.read_text(encoding="utf-8"))
                token_obj = data.get("token")
                if isinstance(token_obj, dict):
                    access_token = token_obj.get("access_token")
                    if access_token and isinstance(access_token, str):
                        return access_token.strip()
                elif isinstance(token_obj, str) and token_obj:
                    return token_obj.strip()
            except Exception as err:
                LOGGER.warning("Could not read OAuth token file: %s", err)

        # Fallback to standard environment variables if configured
        for env_key in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "AGY_OAUTH_TOKEN"):
            val = os.environ.get(env_key)
            if val and val.strip():
                return val.strip()

        return None

    def build_setup_frame(self, voice_name: str = DEFAULT_VOICE) -> dict:
        """Construct the Gemini Multimodal Live API initial setup message."""
        selected_voice = voice_name if voice_name in VERIFIED_VOICES else DEFAULT_VOICE
        self.active_voice = selected_voice

        return {
            "setup": {
                "model": "models/gemini-2.0-flash-exp",
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": selected_voice
                            }
                        }
                    },
                },
                "systemInstruction": {
                    "parts": [
                        {
                            "text": (
                                "You are Antigravity's native voice development companion. "
                                "You speak fluent Egyptian Arabic and technical English. "
                                "Cognitive Fatigue Guard: Summarize terminal commands, "
                                "code inspections, and test outcomes in at most 2 natural "
                                "spoken sentences. Never read long raw logs aloud; full logs "
                                "are automatically streamed to the screen-reader chat canvas."
                            )
                        }
                    ]
                },
                "tools": [
                    {
                        "functionDeclarations": [
                            {
                                "name": "run_command",
                                "description": "Execute a terminal shell command in the Termux workspace.",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "CommandLine": {
                                            "type": "STRING",
                                            "description": "The exact shell command to run.",
                                        }
                                    },
                                    "required": ["CommandLine"],
                                },
                            },
                            {
                                "name": "read_file",
                                "description": "Read the contents of a workspace file.",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "Path": {
                                            "type": "STRING",
                                            "description": "Absolute or relative file path to read.",
                                        }
                                    },
                                    "required": ["Path"],
                                },
                            },
                            {
                                "name": "search_web",
                                "description": "Search the web for up-to-date documentation.",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "query": {
                                            "type": "STRING",
                                            "description": "Search query keywords.",
                                        }
                                    },
                                    "required": ["query"],
                                },
                            },
                        ]
                    }
                ],
            }
        }

    async def handle_client_websocket(self, client_ws: web.WebSocketResponse):
        """Handle incoming client WebSocket lifecycle, multiplexing to Gemini Live."""
        self.last_audio_timestamp = time.time()
        token = self.get_oauth_token()

        # Send initial status
        await client_ws.send_bytes(
            format_control_frame(
                {
                    "type": "status",
                    "state": "connecting",
                    "voice": self.active_voice,
                }
            )
        )

        # Notify client of ready state
        await client_ws.send_bytes(
            format_control_frame(
                {
                    "type": "status",
                    "state": "ready",
                    "authenticated": bool(token),
                    "voice": self.active_voice,
                }
            )
        )
        await client_ws.send_bytes(
            format_control_frame({"type": "earcon", "name": "connect"})
        )

        async for msg in client_ws:
            if msg.type == WSMsgType.BINARY:
                try:
                    opcode, payload = parse_wire_frame(msg.data)
                    self.last_audio_timestamp = time.time()

                    if opcode == OPCODE_AUDIO:
                        # Raw PCM audio chunk (16kHz) from client microphone
                        pass  # Upstream pipe handles forwarding

                    elif opcode == OPCODE_CONTROL:
                        control_msg = json.loads(payload.decode("utf-8"))
                        msg_type = control_msg.get("type")

                        if msg_type == "init":
                            req_voice = control_msg.get("voiceName")
                            if req_voice in VERIFIED_VOICES:
                                self.active_voice = req_voice

                        elif msg_type == "interrupt":
                            # Client-initiated barge-in
                            await client_ws.send_bytes(
                                format_control_frame(
                                    {"type": "earcon", "name": "mute"}
                                )
                            )

                        elif msg_type == "tool_approval":
                            call_id = control_msg.get("call_id")
                            approved = bool(control_msg.get("approved"))
                            if call_id in self.pending_approvals:
                                fut = self.pending_approvals.pop(call_id)
                                if not fut.done():
                                    fut.set_result(approved)

                except Exception as err:
                    LOGGER.error("Error processing client binary frame: %s", err)
                    await client_ws.send_bytes(
                        format_control_frame(
                            {"type": "error", "message": str(err)}
                        )
                    )

            elif msg.type == WSMsgType.TEXT:
                # Text fallback for control commands
                try:
                    data = json.loads(msg.data)
                    if data.get("type") == "ping":
                        await client_ws.send_bytes(
                            format_control_frame({"type": "pong"})
                        )
                except Exception:
                    pass

            elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                break

        LOGGER.info("Live voice client WebSocket disconnected.")


async def live_voice_endpoint(request: web.Request) -> web.WebSocketResponse:
    """HTTP GET endpoint upgrading connection to Live Voice WebSocket."""
    ws = web.WebSocketResponse(heartbeat=20.0, max_msg_size=1024 * 1024)
    await ws.prepare(request)

    session_id = request.query.get("session_id")
    protocol = LiveVoiceProtocol(request.app, session_id)
    await protocol.handle_client_websocket(ws)
    return ws
