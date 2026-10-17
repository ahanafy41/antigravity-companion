import base64
import datetime
import json
import os
from pathlib import Path
import re
import time
import uuid

NAME = re.compile(r"[\w.-]{1,128}")
AUTH_TOKEN_FILE = Path.home() / ".gemini" / "antigravity-cli" / "antigravity-oauth-token"


def get_oauth_token_info():
    if not AUTH_TOKEN_FILE.exists():
        return {
            "logged_in": False,
            "email": None,
            "expiry": None,
            "is_valid": False,
            "token_present": False,
        }
    try:
        data = json.loads(AUTH_TOKEN_FILE.read_text(encoding="utf-8"))
        tok = data.get("token", {}) if isinstance(data, dict) else {}
        access_tok = tok.get("access_token", "")
        refresh_tok = tok.get("refresh_token", "")
        expiry_str = tok.get("expiry", "")
        id_token = data.get("id_token", "")

        email = None
        if id_token and "." in id_token:
            parts = id_token.split(".")
            if len(parts) >= 2:
                payload_b64 = parts[1]
                payload_b64 += "=" * (-len(payload_b64) % 4)
                claims = json.loads(
                    base64.b64decode(payload_b64).decode("utf-8", errors="ignore")
                )
                email = claims.get("email")

        is_valid = False
        if expiry_str:
            try:
                iso_clean = expiry_str.replace("Z", "+00:00")
                exp_ts = datetime.datetime.fromisoformat(iso_clean).timestamp()
                is_valid = bool(access_tok and (exp_ts > time.time() or refresh_tok))
            except Exception:
                is_valid = bool(access_tok)
        else:
            is_valid = bool(access_tok)

        return {
            "logged_in": bool(email or access_tok),
            "email": email,
            "expiry": expiry_str,
            "is_valid": is_valid,
            "token_present": True,
            "has_refresh": bool(refresh_tok),
        }
    except Exception:
        return {
            "logged_in": False,
            "email": None,
            "expiry": None,
            "is_valid": False,
            "token_present": False,
        }


class AuthFlow:
    """Track a handoff request, never infer the native terminal's outcome."""

    def __init__(self, available):
        self.available = bool(available)
        self.pending = None

    def status(self):
        info = get_oauth_token_info()
        return {
            "available": self.available,
            "authenticated": info["is_valid"] if info["logged_in"] else None,
            "logged_in": info["logged_in"],
            "is_valid": info["is_valid"],
            "email": info["email"],
            "expiry": info["expiry"],
            "pending": self.pending is not None,
            "mode": "native_cli",
            "reason": (
                f"متصل بحساب {info['email']}"
                if info["logged_in"] and info["is_valid"]
                else "agy owns sign-in; no machine-readable account status"
            ),
        }

    def start(self, purpose, name=None, cwd=None):
        if purpose not in ("account", "mcp", "logout"):
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
            "action": {
                "account": "login_cli",
                "mcp": "mcp_cli",
                "logout": "logout_cli",
            }[purpose],
            "command": "agy",
        }
        if cwd is not None:
            result["cwd"] = str(cwd)
        if purpose == "mcp":
            result.update(server=name, interactive_command="/mcp")
        elif purpose == "logout":
            result.update(
                interactive_command="/logout",
                reason=(
                    "Logout disconnects saved account profiles; "
                    "API-key mode is unaffected"
                ),
            )
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
