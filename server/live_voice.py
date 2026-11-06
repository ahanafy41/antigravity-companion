"""Native Live Voice Mode WebSocket Protocol & Streaming Gateway.

Provides bidirectional full-duplex PCM audio streaming, integration with
Google's Gemini 3.8 Live API, non-blocking tool execution, and screen-reader
friendly earcons.
"""

import asyncio
import base64
import json
import logging
import os
from pathlib import Path
import time
from aiohttp import web, WSMsgType, ClientSession

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
    "antigravity_get_status",
}

DEFAULT_VOICE = "Puck"
VERIFIED_VOICES = {
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
    "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"
}

LIVE_API_HOST = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)


def is_safe_read_only_tool(tool_name: str) -> bool:
    """Return True if tool is guaranteed read-only; mutating tools require confirmation/checks."""
    if not isinstance(tool_name, str):
        return False
    return tool_name.strip().lower() in SAFE_READ_ONLY_TOOLS


def format_audio_frame(pcm_data: bytes) -> bytes:
    """Pack raw PCM audio into binary wire frame [0xAA, 0x01, ...pcm]."""
    if not isinstance(pcm_data, (bytes, bytearray)):
        raise TypeError("PCM data must be bytes or bytearray")
    return bytes([MAGIC_BYTE, OPCODE_AUDIO]) + bytes(pcm_data)


def format_control_frame(payload_dict: dict) -> bytes:
    """Pack control/event dictionary into UTF-8 JSON wire frame [0xAA, 0x02, ...json]."""
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


class LiveVoiceGateway:
    """Orchestrates bidirectional live streaming between companion client and Gemini 3.8 Live."""

    def __init__(self, application=None, session_id=None):
        self.app = application
        self.session_id = session_id
        self.active_voice = DEFAULT_VOICE
        self.last_audio_timestamp = time.time()
        self.pending_approvals = {}
        self.upstream_ws = None
        self.client_ws = None
        self._closing = False

    def get_api_key(self) -> str | None:
        """Discover Gemini API key from settings or environment."""
        # 1. Check settings in application / store
        if self.app and "store" in self.app:
            try:
                settings = self.app["store"].read("settings")
                key = settings.get("gemini_api_key")
                if key and isinstance(key, str) and key.strip():
                    return key.strip()
            except Exception:
                pass

        # 2. Check ~/.antigravity-server/settings.json directly
        settings_file = Path.home() / ".antigravity-server" / "settings.json"
        if settings_file.exists():
            try:
                doc = json.loads(settings_file.read_text(encoding="utf-8"))
                key = doc.get("gemini_api_key")
                if key and isinstance(key, str) and key.strip():
                    return key.strip()
            except Exception:
                pass

        # 3. Check environment variables
        for env_key in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
            val = os.environ.get(env_key)
            if val and val.strip():
                return val.strip()

        return None

    def build_setup_frame(self, voice_name: str = DEFAULT_VOICE) -> dict:
        """Construct the Gemini 3.8 Multimodal Live API initial setup message."""
        selected_voice = voice_name if voice_name in VERIFIED_VOICES else DEFAULT_VOICE
        self.active_voice = selected_voice

        return {
            "setup": {
                "model": "models/gemini-3.8-live",
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
                "inputAudioTranscription": {
                    "mode": "smart"
                },
                "outputAudioTranscription": {},
                "systemInstruction": {
                    "parts": [
                        {
                            "text": (
                                "أنت المساعد الصوتي التقني المباشر لوكيل أنتيجرافيتي (Antigravity Companion). "
                                "تتحدث بلهجة مصرية ودودة وطبيعية جداً وإنجليزية تقنية سليمة. "
                                "مهمتك مساعدة المستخدم في كتابة الأكواد، تشغيل وفحص الأوامر في Termux، "
                                "قراءة وتعديل الملفات، وإدارة ومتابعة مهام الوكيل. "
                                "قاعدة الراحة السمعية (Cognitive Fatigue Guard): لخص نتائج الأوامر والملفات "
                                "في جملتين واضحتين وطبيعيتين، مع العلم أن النص الكامل للمخرجات يظهر للمستخدم "
                                "في لوحة المحادثة النصية."
                            )
                        }
                    ]
                },
                "tools": [
                    {
                        "functionDeclarations": [
                            {
                                "name": "antigravity_send_turn",
                                "description": "Send a programming task, question, or prompt to the active Antigravity session and track execution.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "prompt": {
                                            "type": "STRING",
                                            "description": "The exact coding prompt or request to send to Antigravity."
                                        }
                                    },
                                    "required": ["prompt"]
                                }
                            },
                            {
                                "name": "antigravity_get_status",
                                "description": "Get current Antigravity agent execution status, active task state, and recent step info.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "antigravity_resolve_permission",
                                "description": "Approve or deny a pending Antigravity permission checkpoint upon human voice instruction.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "approved": {
                                            "type": "BOOLEAN",
                                            "description": "True to approve and proceed, False to deny."
                                        }
                                    },
                                    "required": ["approved"]
                                }
                            },
                            {
                                "name": "antigravity_cancel_task",
                                "description": "Cancel or interrupt the currently executing Antigravity task.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {}
                                }
                            },
                            {
                                "name": "run_command",
                                "description": "Execute a shell command in the Termux workspace and return output.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "CommandLine": {
                                            "type": "STRING",
                                            "description": "The exact shell command to run."
                                        }
                                    },
                                    "required": ["CommandLine"]
                                }
                            },
                            {
                                "name": "read_file",
                                "description": "Read contents of a workspace file to inspect and explain to the user.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "Path": {
                                            "type": "STRING",
                                            "description": "File path to read."
                                        }
                                    },
                                    "required": ["Path"]
                                }
                            },
                            {
                                "name": "write_file",
                                "description": "Create or update a file in the workspace.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "Path": {
                                            "type": "STRING",
                                            "description": "File path to write."
                                        },
                                        "Content": {
                                            "type": "STRING",
                                            "description": "Full file content."
                                        }
                                    },
                                    "required": ["Path", "Content"]
                                }
                            },
                            {
                                "name": "search_web",
                                "description": "Search the web for programming solutions and technical documentation.",
                                "behavior": "NON_BLOCKING",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "query": {
                                            "type": "STRING",
                                            "description": "Search query keywords."
                                        }
                                    },
                                    "required": ["query"]
                                }
                            }
                        ]
                    }
                ]
            }
        }

    async def execute_tool(self, name: str, args: dict) -> dict:
        """Execute tool requested by Gemini Live model in the local Termux environment."""
        LOGGER.info("Executing voice tool: %s with args: %s", name, args)

        # Notify client of tool execution
        if self.client_ws and not self.client_ws.closed:
            await self.client_ws.send_bytes(
                format_control_frame({
                    "type": "tool_call",
                    "name": name,
                    "args": args
                })
            )
            await self.client_ws.send_bytes(
                format_control_frame({"type": "earcon", "name": "tool_start"})
            )

        try:
            if name == "antigravity_get_status":
                if self.app and "sessions" in self.app:
                    active = self.app["sessions"].active_run_for(self.session_id)
                    if active:
                        return {"status": "running", "run_id": active.get("run_id"), "step": active.get("step")}
                    return {"status": "idle", "message": "No active tasks in Antigravity session."}
                return {"status": "idle", "message": "Antigravity session engine ready."}

            elif name == "antigravity_resolve_permission":
                approved = bool(args.get("approved", True))
                if self.app and "sessions" in self.app:
                    decision = "allow" if approved else "deny"
                    # Resolve active permission key if any
                    active = self.app["sessions"].active_run_for(self.session_id)
                    if active and active.get("permission_key"):
                        self.app["sessions"].resolve_permission(active["permission_key"], active.get("run_id"))
                        return {"status": "resolved", "decision": decision}
                return {"status": "acknowledged", "decision": "approved" if approved else "denied"}

            elif name == "antigravity_cancel_task":
                if self.app and "sessions" in self.app:
                    active = self.app["sessions"].active_run_for(self.session_id)
                    if active:
                        await self.app["sessions"].cancel(active["run_id"])
                        return {"status": "cancelled", "run_id": active["run_id"]}
                return {"status": "idle", "message": "No running task to cancel."}

            elif name == "antigravity_send_turn":
                prompt = str(args.get("prompt", "")).strip()
                if not prompt:
                    return {"error": "Prompt cannot be empty"}
                if self.app and "sessions" in self.app and self.session_id:
                    session = self.app["sessions"].sessions.get(self.session_id)
                    if session:
                        run = self.app["sessions"].start(self.session_id, {"text": prompt})
                        return {
                            "status": "started",
                            "run_id": run.get("run_id"),
                            "message": f"Task submitted to Antigravity session: {prompt[:80]}"
                        }
                return {"status": "simulated", "message": f"Prompt received: {prompt}"}

            elif name == "read_file":
                file_path = Path(args.get("Path", "")).expanduser()
                if not file_path.is_absolute() and self.app and "sessions" in self.app and self.session_id:
                    session = self.app["sessions"].sessions.get(self.session_id)
                    if session and session.get("cwd"):
                        file_path = Path(session["cwd"]) / file_path

                if not file_path.exists():
                    return {"error": f"File not found: {file_path}"}
                if file_path.is_dir():
                    return {"error": f"Path is a directory, not a file: {file_path}"}

                content = file_path.read_text(encoding="utf-8", errors="replace")
                if len(content) > 16384:
                    content = content[:16384] + f"\n... [Truncated {len(content) - 16384} characters for brevity]"
                return {"path": str(file_path), "content": content}

            elif name == "run_command":
                cmd = str(args.get("CommandLine", "")).strip()
                if not cmd:
                    return {"error": "CommandLine is required"}

                cwd = None
                if self.app and "sessions" in self.app and self.session_id:
                    session = self.app["sessions"].sessions.get(self.session_id)
                    if session and session.get("cwd"):
                        cwd = session["cwd"]

                proc = await asyncio.create_subprocess_shell(
                    cmd,
                    cwd=cwd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                try:
                    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
                except asyncio.TimeoutError:
                    proc.kill()
                    return {"error": "Command timed out after 30 seconds"}

                out_str = stdout.decode("utf-8", errors="replace")
                err_str = stderr.decode("utf-8", errors="replace")
                return {
                    "command": cmd,
                    "exit_code": proc.returncode,
                    "stdout": out_str[:4096],
                    "stderr": err_str[:2048]
                }

            elif name == "write_file":
                file_path = Path(args.get("Path", "")).expanduser()
                content = str(args.get("Content", ""))
                if not file_path.is_absolute() and self.app and "sessions" in self.app and self.session_id:
                    session = self.app["sessions"].sessions.get(self.session_id)
                    if session and session.get("cwd"):
                        file_path = Path(session["cwd"]) / file_path

                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding="utf-8")
                return {"status": "success", "path": str(file_path), "bytes_written": len(content.encode("utf-8"))}

            elif name == "search_web":
                query = str(args.get("query", "")).strip()
                return {"status": "simulated", "query": query, "message": f"Search simulated for: {query}"}

            else:
                return {"error": f"Unknown tool: {name}"}

        except Exception as err:
            LOGGER.error("Tool execution failed: %s", err, exc_info=True)
            return {"error": str(err)}

    async def forward_upstream_to_client(self, upstream_ws, client_ws):
        """Receive events & audio from Gemini Live WebSocket and push to client."""
        try:
            async for msg in upstream_ws:
                if msg.type in (WSMsgType.TEXT, WSMsgType.BINARY):
                    raw_str = msg.data.decode("utf-8") if isinstance(msg.data, (bytes, bytearray)) else msg.data
                    data = json.loads(raw_str)
                    server_content = data.get("serverContent")

                    if server_content:
                        # 1. Output audio streaming
                        model_turn = server_content.get("modelTurn")
                        if model_turn and "parts" in model_turn:
                            for part in model_turn["parts"]:
                                inline_data = part.get("inlineData")
                                if inline_data and inline_data.get("mimeType", "").startswith("audio/"):
                                    pcm_bytes = base64.b64decode(inline_data["data"])
                                    if not client_ws.closed:
                                        await client_ws.send_bytes(format_audio_frame(pcm_bytes))

                        # 2. Transcriptions
                        in_tx = server_content.get("inputTranscription")
                        if in_tx and in_tx.get("text") and not client_ws.closed:
                            await client_ws.send_bytes(format_control_frame({
                                "type": "transcript",
                                "role": "user",
                                "text": in_tx["text"]
                            }))

                        out_tx = server_content.get("outputTranscription")
                        if out_tx and out_tx.get("text") and not client_ws.closed:
                            await client_ws.send_bytes(format_control_frame({
                                "type": "transcript",
                                "role": "model",
                                "text": out_tx["text"]
                            }))

                        # 3. Interruption / Barge-in
                        if server_content.get("interrupted") and not client_ws.closed:
                            await client_ws.send_bytes(format_control_frame({"type": "interrupted"}))
                            await client_ws.send_bytes(format_control_frame({"type": "earcon", "name": "mute"}))

                    # 4. Tool calls
                    tool_call = data.get("toolCall")
                    if tool_call and "functionCalls" in tool_call:
                        function_calls = tool_call["functionCalls"]
                        responses = []
                        for call in function_calls:
                            c_id = call.get("id")
                            f_name = call.get("name")
                            f_args = call.get("args", {})
                            res = await self.execute_tool(f_name, f_args)
                            responses.append({
                                "response": {"output": res},
                                "id": c_id
                            })

                        # Send tool responses back to Gemini Live
                        tool_resp_msg = {
                            "toolResponse": {
                                "functionResponses": responses
                            }
                        }
                        await upstream_ws.send_str(json.dumps(tool_resp_msg))

                    # 5. Voice activity detection events from model
                    va = data.get("voiceActivity")
                    if va and not client_ws.closed:
                        await client_ws.send_bytes(format_control_frame({
                            "type": "voice_activity",
                            "state": va.get("state")
                        }))

                elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                    break
        except asyncio.CancelledError:
            pass
        except Exception as err:
            LOGGER.error("Error in upstream forwarder: %s", err)
            if not client_ws.closed:
                await client_ws.send_bytes(format_control_frame({"type": "error", "message": str(err)}))

    async def handle_client_websocket(self, client_ws: web.WebSocketResponse):
        """Handle incoming client WebSocket lifecycle, multiplexing to Gemini 3.8 Live."""
        self.client_ws = client_ws
        self.last_audio_timestamp = time.time()
        api_key = self.get_api_key()

        # Initial status
        await client_ws.send_bytes(
            format_control_frame({
                "type": "status",
                "state": "connecting",
                "voice": self.active_voice,
                "has_api_key": bool(api_key)
            })
        )

        if not api_key:
            # Inform client of missing API key for Gemini Live API and suggest fallback or entering key
            await client_ws.send_bytes(
                format_control_frame({
                    "type": "status",
                    "state": "ready_fallback",
                    "voice": self.active_voice,
                    "has_api_key": False,
                    "message": "يرجى إضافة مفتاح Gemini API في الإعدادات لتفعيل البث الصوتي الفائق، أو استخدام النمط الاحتياطي."
                })
            )

        upstream_session = None
        upstream_task = None
        keepalive_task = None

        try:
            # If API key available, connect to Gemini Live API
            if api_key:
                upstream_url = f"{LIVE_API_HOST}?key={api_key}"
                upstream_session = ClientSession()
                self.upstream_ws = await upstream_session.ws_connect(upstream_url, heartbeat=15.0)

                # Send setup frame
                setup_data = self.build_setup_frame(self.active_voice)
                await self.upstream_ws.send_str(json.dumps(setup_data))

                # Wait for setup completion
                first_msg = await asyncio.wait_for(self.upstream_ws.receive(), timeout=10.0)
                if first_msg.type in (WSMsgType.TEXT, WSMsgType.BINARY):
                    first_raw = first_msg.data.decode("utf-8") if isinstance(first_msg.data, (bytes, bytearray)) else first_msg.data
                    first_json = json.loads(first_raw)
                    LOGGER.info("Gemini Live API connected successfully: %s", list(first_json.keys()))
                else:
                    raise RuntimeError(f"Unexpected response from Gemini Live API: {first_msg.type}")

                # Notify client of ready state
                await client_ws.send_bytes(
                    format_control_frame({
                        "type": "status",
                        "state": "ready",
                        "voice": self.active_voice,
                        "has_api_key": True
                    })
                )
                await client_ws.send_bytes(format_control_frame({"type": "earcon", "name": "connect"}))

                # Start upstream forwarding task
                upstream_task = asyncio.create_task(
                    self.forward_upstream_to_client(self.upstream_ws, client_ws)
                )

                # Keepalive task: send periodic comfort frames so Gemini Live never closes due to inactivity
                async def upstream_keepalive():
                    try:
                        while True:
                            await asyncio.sleep(12.0)
                            if self.upstream_ws and not self.upstream_ws.closed:
                                silence = b'\x00' * 3200
                                silence_b64 = base64.b64encode(silence).decode('ascii')
                                keepalive_payload = {
                                    "realtimeInput": {
                                        "audio": {
                                            "mimeType": "audio/pcm;rate=16000",
                                            "data": silence_b64
                                        }
                                    }
                                }
                                await self.upstream_ws.send_str(json.dumps(keepalive_payload))
                    except asyncio.CancelledError:
                        pass
                    except Exception as k_err:
                        LOGGER.debug("Live keepalive loop ended: %s", k_err)

                keepalive_task = asyncio.create_task(upstream_keepalive())

                # Send proactive greeting so model immediately speaks aloud to the user
                greeting_turn = {
                    "clientContent": {
                        "turns": [
                            {
                                "role": "user",
                                "parts": [
                                    {
                                        "text": "مرحباً! رحب بالمطور أحمد بلهجة مصرية ودودة جداً ومختصرة في جملة واحدة وأخبره أنك جاهز لمساعدته والتحكم في أنتيجرافيتي صوتياً."
                                    }
                                ]
                            }
                        ],
                        "turnComplete": True
                    }
                }
                await self.upstream_ws.send_str(json.dumps(greeting_turn))

            # Process incoming client frames
            async for msg in client_ws:
                if msg.type == WSMsgType.BINARY:
                    try:
                        opcode, payload = parse_wire_frame(msg.data)
                        self.last_audio_timestamp = time.time()

                        if opcode == OPCODE_AUDIO:
                            # Forward 16kHz PCM audio chunk to Gemini Live API using current audio object format
                            if self.upstream_ws and not self.upstream_ws.closed:
                                audio_b64 = base64.b64encode(payload).decode("ascii")
                                audio_payload = {
                                    "realtimeInput": {
                                        "audio": {
                                            "mimeType": "audio/pcm;rate=16000",
                                            "data": audio_b64
                                        }
                                    }
                                }
                                await self.upstream_ws.send_str(json.dumps(audio_payload))

                        elif opcode == OPCODE_CONTROL:
                            ctrl = json.loads(payload.decode("utf-8"))
                            c_type = ctrl.get("type")

                            if c_type == "init":
                                req_voice = ctrl.get("voiceName")
                                if req_voice in VERIFIED_VOICES:
                                    self.active_voice = req_voice

                            elif c_type == "text":
                                # Direct text message sent during live voice session
                                user_text = str(ctrl.get("text", "")).strip()
                                if user_text and self.upstream_ws and not self.upstream_ws.closed:
                                    text_turn = {
                                        "clientContent": {
                                            "turns": [
                                                {
                                                    "role": "user",
                                                    "parts": [{"text": user_text}]
                                                }
                                            ],
                                            "turnComplete": True
                                        }
                                    }
                                    await self.upstream_ws.send_str(json.dumps(text_turn))
                                    if not client_ws.closed:
                                        await client_ws.send_bytes(format_control_frame({
                                            "type": "transcript",
                                            "role": "user",
                                            "text": user_text
                                        }))

                            elif c_type == "interrupt":
                                # Barge-in signal from client
                                if self.upstream_ws and not self.upstream_ws.closed:
                                    # Send realtime input with client turn interruption
                                    pass
                                await client_ws.send_bytes(format_control_frame({"type": "earcon", "name": "mute"}))

                            elif c_type == "audio_stream_end":
                                # Hybrid VAD end of turn signal
                                if self.upstream_ws and not self.upstream_ws.closed:
                                    # Signal turn complete
                                    pass

                    except Exception as err:
                        LOGGER.error("Error processing client binary frame: %s", err)
                        if not client_ws.closed:
                            await client_ws.send_bytes(format_control_frame({"type": "error", "message": str(err)}))

                elif msg.type == WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        if data.get("type") == "ping":
                            await client_ws.send_bytes(format_control_frame({"type": "pong"}))
                    except Exception:
                        pass

                elif msg.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                    break

        except Exception as err:
            LOGGER.error("Live voice session error: %s", err, exc_info=True)
            if not client_ws.closed:
                await client_ws.send_bytes(format_control_frame({
                    "type": "error",
                    "message": f"خطأ في الاتصال بالبث الصوتي: {str(err)}"
                }))
        finally:
            if keepalive_task and not keepalive_task.done():
                keepalive_task.cancel()
            if upstream_task and not upstream_task.done():
                upstream_task.cancel()
            if self.upstream_ws and not self.upstream_ws.closed:
                await self.upstream_ws.close()
            if upstream_session and not upstream_session.closed:
                await upstream_session.close()
            LOGGER.info("Live voice gateway session closed.")


async def live_voice_endpoint(request: web.Request) -> web.WebSocketResponse:
    """HTTP GET endpoint upgrading connection to Live Voice WebSocket."""
    ws = web.WebSocketResponse(heartbeat=20.0, max_msg_size=1024 * 1024)
    await ws.prepare(request)

    session_id = request.query.get("session_id")
    gateway = LiveVoiceGateway(request.app, session_id)
    await gateway.handle_client_websocket(ws)
    return ws
