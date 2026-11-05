"""Unit and integration tests for Native Live Voice WebSocket Protocol and Gateway."""

import asyncio
import json
import unittest
from pathlib import Path
import sys

# Ensure server module path is accessible
SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from live_voice import (
    LiveVoiceProtocol,
    MAGIC_BYTE,
    OPCODE_AUDIO,
    OPCODE_CONTROL,
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
        self.assertTrue(is_safe_read_only_tool("read_file"))
        self.assertTrue(is_safe_read_only_tool("search_web"))
        self.assertTrue(is_safe_read_only_tool("read_url_content"))
        self.assertTrue(is_safe_read_only_tool("fetch"))

        # Mutating tools must require human approval
        self.assertFalse(is_safe_read_only_tool("run_command"))
        self.assertFalse(is_safe_read_only_tool("edit_file"))
        self.assertFalse(is_safe_read_only_tool("write_file"))
        self.assertFalse(is_safe_read_only_tool("replace_file_content"))
        self.assertFalse(is_safe_read_only_tool("random_unknown_tool"))

    def test_token_discovery_logic(self):
        protocol = LiveVoiceProtocol(None, None)
        token = protocol.get_oauth_token()
        # Verify it loads a non-empty string or None without crashing
        if token:
            self.assertTrue(isinstance(token, str))
            self.assertTrue(len(token) > 10)


if __name__ == "__main__":
    unittest.main()
