"""User-owned native agy login handoff without credential inspection."""

import re
import uuid

NAME = re.compile(r"[\w.-]{1,128}")


class AuthFlow:
    """Track a handoff request, never infer the native terminal's outcome."""

    def __init__(self, available):
        self.available = bool(available)
        self.pending = None

    def status(self):
        return {
            "available": self.available,
            "authenticated": None,
            "pending": self.pending is not None,
            "mode": "native_cli",
            "reason": "agy owns sign-in; no machine-readable account status",
        }

    def start(self, purpose, name=None, cwd=None):
        if purpose not in ("account", "mcp"):
            raise ValueError("Invalid native authentication purpose")
        if purpose == "mcp" and (
            not isinstance(name, str) or not NAME.fullmatch(name)
        ):
            raise ValueError("Invalid MCP server name")
        if not self.available:
            return {"status": "unavailable", "authenticated": None}
        self.pending = uuid.uuid4().hex
        result = {
            "status": "native_launch",
            "request_id": self.pending,
            "authenticated": None,
            "action": "login_cli" if purpose == "account" else "mcp_cli",
            "command": "agy",
        }
        if cwd is not None:
            result["cwd"] = str(cwd)
        if purpose == "mcp":
            result.update(server=name, interactive_command="/mcp")
        return result

    def cancel(self, request_id):
        if not self.pending or request_id != self.pending:
            raise ValueError("Authentication handoff is no longer active")
        self.pending = None
        return {
            "status": "cancelled",
            "authenticated": None,
            "terminal_stopped": False,
            "reason": "Handoff cancelled; the user owns the native terminal",
        }
