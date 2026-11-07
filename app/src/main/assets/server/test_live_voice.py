"""Unit and integration tests for Native Live Voice WebSocket Protocol and Gateway."""

import asyncio
import json
import unittest
from pathlib import Path
import sys
import tempfile

# Ensure server module path is accessible
SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from live_voice import (
    LiveVoiceGateway,
    MAGIC_BYTE,
    OPCODE_AUDIO,
    OPCODE_CONTROL,
    DEFAULT_VOICE,
    VERIFIED_VOICES,
    is_safe_read_only_tool,
    format_audio_frame,
    format_control_frame,
    parse_wire_frame,
)


class TestLiveVoiceProtocol(unittest.TestCase):
    def test_wire_framing_audio(self):
        pcm_data = b"\x00\x01\x02\x03\x04\x05"
        framed = format_audio_frame(pcm_data)
        self.assertEqual(len(framed), 2 + len(pcm_data))
        self.assertEqual(framed[0], MAGIC_BYTE)
        self.assertEqual(framed[1], OPCODE_AUDIO)

        opcode, payload = parse_wire_frame(framed)
        self.assertEqual(opcode, OPCODE_AUDIO)
        self.assertEqual(payload, pcm_data)

    def test_wire_framing_control_json(self):
        msg = {"type": "status", "state": "listening"}
        framed = format_control_frame(msg)
        self.assertEqual(framed[0], MAGIC_BYTE)
        self.assertEqual(framed[1], OPCODE_CONTROL)

        opcode, payload = parse_wire_frame(framed)
        self.assertEqual(opcode, OPCODE_CONTROL)
        parsed_json = json.loads(payload.decode("utf-8"))
        self.assertEqual(parsed_json["type"], "status")
        self.assertEqual(parsed_json["state"], "listening")

    def test_wire_framing_invalid_magic(self):
        invalid_data = b"\xFF\x01\x12\x34"
        with self.assertRaises(ValueError):
            parse_wire_frame(invalid_data)

    def test_wire_framing_truncated(self):
        truncated = b"\xAA"
        with self.assertRaises(ValueError):
            parse_wire_frame(truncated)

    def test_safe_read_only_tool_classification(self):
        self.assertTrue(is_safe_read_only_tool("antigravity_get_status"))

        # Mutating tools must not be classified as safe read-only
        self.assertFalse(is_safe_read_only_tool("antigravity_send_turn"))
        self.assertFalse(is_safe_read_only_tool("antigravity_resolve_permission"))
        self.assertFalse(is_safe_read_only_tool("antigravity_cancel_task"))

    def test_setup_frame_gemini_38(self):
        gateway = LiveVoiceGateway(None, None)
        setup = gateway.build_setup_frame("Charon")

        self.assertIn("setup", setup)
        s_obj = setup["setup"]
        self.assertEqual(s_obj["model"], "models/gemini-3.8-live")
        self.assertEqual(s_obj["generationConfig"]["responseModalities"], ["AUDIO"])
        self.assertEqual(
            s_obj["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"],
            "Charon"
        )
        self.assertEqual(s_obj["inputAudioTranscription"]["mode"], "smart")

        # Verify tool declarations have NON_BLOCKING behavior and pure Antigravity tools
        tools = s_obj["tools"][0]["functionDeclarations"]
        tool_names = [t["name"] for t in tools]
        self.assertEqual(
            sorted(tool_names),
            sorted([
                "antigravity_send_turn",
                "antigravity_get_status",
                "antigravity_resolve_permission",
                "antigravity_cancel_task",
            ])
        )
        for t in tools:
            self.assertEqual(t.get("behavior"), "NON_BLOCKING")

    def test_verified_voices_catalog(self):
        self.assertEqual(len(VERIFIED_VOICES), 30)
        self.assertIn("Puck", VERIFIED_VOICES)
        self.assertIn("Charon", VERIFIED_VOICES)
        self.assertIn("Kore", VERIFIED_VOICES)
        self.assertIn("Sulafat", VERIFIED_VOICES)

    def test_tool_execution_antigravity_get_status(self):
        async def run_test():
            gateway = LiveVoiceGateway(None, None)
            res = await gateway.execute_tool("antigravity_get_status", {})
            self.assertEqual(res.get("status"), "idle")
            self.assertIn("جاهز", res.get("message", ""))

        asyncio.run(run_test())

    def test_tool_execution_unknown_tool(self):
        async def run_test():
            gateway = LiveVoiceGateway(None, None)
            res = await gateway.execute_tool("unknown_tool", {})
            self.assertIn("error", res)

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
