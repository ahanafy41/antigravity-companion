"""Sparse OAuth edits in the existing CLI-owned MCP configuration."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile

from storage import StorageConflict

LIMIT = 1024 * 1024
NAME = re.compile(r"[\w.-]{1,128}")


def reject_linked_path(path):
    for component in (path, *path.absolute().parents):
        if component.is_symlink():
            raise PermissionError("Linked MCP configuration cannot be edited")
        try:
            attributes = component.stat().st_file_attributes
        except (FileNotFoundError, AttributeError):
            continue
        if attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise PermissionError("Linked MCP configuration cannot be edited")


def document_at(path):
    reject_linked_path(path)
    try:
        with path.open("rb") as stream:
            raw = stream.read(LIMIT + 1)
    except FileNotFoundError:
        return None
    if len(raw) > LIMIT:
        raise ValueError("MCP configuration exceeds its size limit")
    document = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(document, dict) or not isinstance(
        document.get("mcpServers"), dict
    ):
        raise ValueError("Invalid MCP configuration")
    return document, raw


def oauth_patch(payload):
    if not isinstance(payload, dict) or set(payload) - {
        "client_id",
        "client_secret",
        "clear_client_secret",
    }:
        raise ValueError("Only MCP OAuth client fields may be changed")
    result = {}
    for key, field in (
        ("client_id", "clientId"),
        ("client_secret", "clientSecret"),
    ):
        if key not in payload:
            continue
        value = payload[key]
        if (
            not isinstance(value, str)
            or len(value) > 4096
            or any(
                ord(character) < 32 or ord(character) == 127
                for character in value
            )
        ):
            raise ValueError("Invalid MCP OAuth client value")
        if not value:
            if key == "client_secret":
                continue
            raise ValueError("MCP OAuth client ID must not be empty")
        result[field] = value
    clear = payload.get("clear_client_secret", False)
    if not isinstance(clear, bool) or (clear and "clientSecret" in result):
        raise ValueError("Invalid MCP OAuth secret clear request")
    return result, clear


class MCPSettings:
    def __init__(self, home=None):
        self.home = Path(home) if home is not None else Path.home()

    def owner(self, name, cwd):
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("Invalid configured MCP server name")
        selected = None
        for scope, path in (
            ("global", self.home / ".gemini" / "config" / "mcp_config.json"),
            ("workspace", Path(cwd) / ".agents" / "mcp_config.json"),
        ):
            loaded = document_at(path)
            if loaded is not None and name in loaded[0]["mcpServers"]:
                selected = (scope, path, *loaded)
        if selected is None:
            raise ValueError("MCP server is not configured")
        if not isinstance(selected[2]["mcpServers"][name], dict):
            raise ValueError("Invalid MCP server configuration")
        return selected

    @staticmethod
    def view(scope, document, raw, name):
        oauth = document["mcpServers"][name].get("oauth", {})
        if not isinstance(oauth, dict):
            raise ValueError("Invalid MCP OAuth configuration")
        return {
            "configured": bool(oauth),
            "has_client_id": bool(oauth.get("clientId")),
            "has_client_secret": bool(oauth.get("clientSecret")),
            "revision": hashlib.sha256(
                scope.encode() + b"\0" + raw
            ).hexdigest(),
            "owner": "agy",
            "scope": scope,
            "effective": "next_cli_reload",
        }

    def read_oauth(self, name, cwd):
        scope, path, document, raw = self.owner(name, cwd)
        return self.view(scope, document, raw, name)

    def write_oauth(self, name, cwd, payload, revision):
        patch, clear = oauth_patch(payload)
        scope, path, document, raw = self.owner(name, cwd)
        lock = path.with_name(path.name + ".companion-lock")
        reject_linked_path(lock)
        try:
            descriptor = os.open(
                lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
        except FileExistsError as failure:
            raise StorageConflict(
                "MCP configuration is being edited"
            ) from failure
        os.close(descriptor)
        staged = None
        try:
            selected = self.owner(name, cwd)
            if selected[0:2] != (scope, path):
                raise StorageConflict("MCP configuration owner changed")
            document, raw = selected[2:]
            current = self.view(scope, document, raw, name)
            if (
                not isinstance(revision, str)
                or revision != current["revision"]
            ):
                raise StorageConflict("MCP configuration revision conflict")
            server = document["mcpServers"][name]
            oauth = {**server.get("oauth", {}), **patch}
            if clear:
                oauth.pop("clientSecret", None)
            server["oauth"] = oauth
            descriptor, staged = tempfile.mkstemp(
                dir=path.parent, prefix=".companion-oauth-"
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(document, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            if self.read_oauth(name, cwd)["revision"] != revision:
                raise StorageConflict("MCP configuration changed during edit")
            backup = path.with_name(path.name + ".companion-bak")
            reject_linked_path(backup)
            shutil.copy2(path, backup)
            os.chmod(backup, 0o600)
            os.chmod(staged, 0o600)
            os.replace(staged, path)
            return self.read_oauth(name, cwd)
        finally:
            if staged is not None:
                Path(staged).unlink(missing_ok=True)
            lock.unlink(missing_ok=True)


def read_oauth(name, cwd):
    return MCPSettings().read_oauth(name, cwd)


def write_oauth(name, cwd, payload, revision):
    return MCPSettings().write_oauth(name, cwd, payload, revision)
