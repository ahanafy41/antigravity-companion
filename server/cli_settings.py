"""Edit only documented CLI policy without exposing the account document."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

from storage import StorageConflict


def policy_values(policy):
    if not isinstance(policy, dict) or set(policy) - {"allow", "deny", "ask"}:
        raise ValueError("Only allow, deny and ask policy lists are supported")
    result = {}
    for name, values in policy.items():
        if not isinstance(values, list) or len(values) > 256:
            raise ValueError("Policy rules must be bounded lists")
        normalized = []
        for value in values:
            if (
                not isinstance(value, str)
                or not value.strip()
                or len(value) > 512
                or any(ord(character) < 32 for character in value)
            ):
                raise ValueError("Invalid permission rule")
            normalized.append(value.strip())
        result[name] = list(dict.fromkeys(normalized))
    return result


class CLISettings:
    def __init__(self, path=None):
        self.path = (
            Path(path)
            if path is not None
            else (
                Path.home() / ".gemini" / "antigravity-cli" / "settings.json"
            )
        )

    def _document(self):
        if self.path.is_symlink() or self.path.parent.is_symlink():
            raise PermissionError("Linked CLI settings cannot be edited")
        try:
            raw = self.path.read_bytes()
        except FileNotFoundError:
            raw = b""
        if len(raw) > 1024 * 1024:
            raise ValueError("CLI settings exceed the safety limit")
        document = json.loads(raw.decode("utf-8-sig")) if raw else {}
        if not isinstance(document, dict):
            raise ValueError("CLI settings must be an object")
        return document, hashlib.sha256(raw).hexdigest()

    @staticmethod
    def _view(document, revision):
        permissions = document.get("permissions", {})
        if not isinstance(permissions, dict):
            raise ValueError("CLI permissions must be an object")
        return {
            "permissions": policy_values(
                {
                    key: permissions.get(key, [])
                    for key in ("allow", "deny", "ask")
                }
            ),
            "revision": revision,
            "owner": "agy",
            "effective": "next_cli_process",
        }

    def read_policy(self):
        return self._view(*self._document())

    def write_policy(self, patch, revision):
        patch = policy_values(patch)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = self.path.with_name(self.path.name + ".companion-lock")
        try:
            descriptor = os.open(
                lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
        except FileExistsError as failure:
            raise StorageConflict("CLI settings are being edited") from failure
        os.close(descriptor)
        staged = None
        try:
            document, current_revision = self._document()
            if not isinstance(revision, str) or revision != current_revision:
                raise StorageConflict("CLI settings revision conflict")
            self._view(document, current_revision)
            document["permissions"] = {
                **document.get("permissions", {}),
                **patch,
            }
            descriptor, staged = tempfile.mkstemp(
                dir=self.path.parent, prefix=".companion-policy-"
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(document, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            # Preserve edits made after the initial revision read.
            if self._document()[1] != current_revision:
                raise StorageConflict("CLI settings changed during edit")
            if self.path.exists():
                backup = self.path.with_name(self.path.name + ".companion-bak")
                if backup.is_symlink():
                    raise PermissionError("Linked backup cannot be replaced")
                shutil.copy2(self.path, backup)
                os.chmod(backup, 0o600)
            os.chmod(staged, 0o600)
            os.replace(staged, self.path)
            return self.read_policy()
        finally:
            if staged is not None:
                Path(staged).unlink(missing_ok=True)
            lock.unlink(missing_ok=True)
