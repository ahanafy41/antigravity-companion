"""Edit only documented CLI policy without exposing the account document."""

import hashlib
import json
import os
from pathlib import Path
import re
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

    @staticmethod
    def _settings_view(document, revision):
        permissions = document.get("permissions", {})
        if not isinstance(permissions, dict):
            permissions = {}
        allow = permissions.get("allow", [])
        if not isinstance(allow, list):
            allow = []
        is_safe = bool(document.get("safe_mode", True))
        return {
            "model": document.get("model", "gemini-3.8-flash-medium"),
            "effort": document.get("effort", "medium"),
            "safe_mode": is_safe,
            "autopilot": not is_safe,
            "allow_commands": "command" in allow or "command(*)" in allow,
            "allow_write": "file_write" in allow or "write_file(*)" in allow,
            "allow_web": "web_access" in allow or "read_url(*)" in allow,
            "allow_subagent": "subagents" in allow or "invoke_subagent(*)" in allow,
            "allow_schedule": "schedule" in allow or "schedule(*)" in allow,
            "allowNonWorkspaceAccess": bool(document.get("allowNonWorkspaceAccess", True)),
            "sandbox": bool(document.get("sandbox", False)),
            "mode": document.get("mode", "accept-edits"),
            "speech_enabled": bool(document.get("speech_enabled", True)),
            "tones_enabled": bool(document.get("tones_enabled", True)),
            "haptic_enabled": bool(document.get("haptic_enabled", True)),
            "trustedWorkspaces": document.get("trustedWorkspaces", [str(Path.home())]),
            "whitelist": allow,
            "permissions": policy_values(
                {
                    key: permissions.get(key, [])
                    for key in ("allow", "deny", "ask")
                }
            ),
            "revision": revision,
            "owner": "agy",
            "effective": "immediate",
        }

    def read_settings(self):
        return self._settings_view(*self._document())

    def write_settings(self, patch, revision=None):
        if not isinstance(patch, dict):
            raise ValueError("Settings patch must be an object")
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
            if revision is None or not str(revision).strip():
                raise StorageConflict("CLI settings revision is required")
            if str(revision).strip() != current_revision:
                raise StorageConflict("CLI settings revision conflict")

            for key in ("speech_enabled", "tones_enabled", "haptic_enabled", "sandbox", "allowNonWorkspaceAccess"):
                if key in patch:
                    document[key] = bool(patch[key])

            if "mode" in patch and isinstance(patch["mode"], str):
                document["mode"] = patch["mode"]

            if "trustedWorkspaces" in patch and isinstance(patch["trustedWorkspaces"], list):
                document["trustedWorkspaces"] = [
                    str(p).strip() for p in patch["trustedWorkspaces"] if isinstance(p, (str, Path)) and str(p).strip()
                ]

            if "model" in patch and isinstance(patch["model"], str) and patch["model"].strip():
                new_model = patch["model"].strip()
                document["model"] = new_model
                m_eff = re.search(r"-(low|medium|high)$", new_model)
                if m_eff:
                    document["effort"] = m_eff.group(1)

            if "effort" in patch and isinstance(patch["effort"], str) and patch["effort"].strip():
                new_effort = patch["effort"].strip()
                if new_effort in ("low", "medium", "high", "max"):
                    document["effort"] = new_effort
                    cur_m = document.get("model", "")
                    if re.search(r"-(low|medium|high)$", cur_m):
                        document["model"] = re.sub(r"-(low|medium|high)$", f"-{new_effort}", cur_m)

            if "autopilot" in patch and "safe_mode" not in patch:
                document["safe_mode"] = not bool(patch["autopilot"])
            elif "safe_mode" in patch:
                document["safe_mode"] = bool(patch["safe_mode"])

            permissions = document.setdefault("permissions", {})
            if not isinstance(permissions, dict):
                permissions = {}
                document["permissions"] = permissions

            allow_rules = list(permissions.get("allow", [])) if isinstance(permissions.get("allow"), list) else []

            if "whitelist" in patch and isinstance(patch["whitelist"], list):
                allow_rules = [str(r).strip() for r in patch["whitelist"] if isinstance(r, str) and str(r).strip()]

            def toggle_rule(rule_patterns, enabled):
                nonlocal allow_rules
                if enabled:
                    if not any(r in allow_rules for r in rule_patterns):
                        allow_rules.append(rule_patterns[-1])
                else:
                    allow_rules = [r for r in allow_rules if r not in rule_patterns]

            if "allow_commands" in patch:
                toggle_rule(["command", "command(*)"], bool(patch["allow_commands"]))
            if "allow_write" in patch:
                toggle_rule(["file_write", "write_file(*)"], bool(patch["allow_write"]))
            if "allow_web" in patch:
                toggle_rule(["web_access", "read_url(*)"], bool(patch["allow_web"]))
            if "allow_subagent" in patch:
                toggle_rule(["subagents", "invoke_subagent(*)"], bool(patch["allow_subagent"]))
            if "allow_schedule" in patch:
                toggle_rule(["schedule", "schedule(*)"], bool(patch["allow_schedule"]))

            permissions["allow"] = list(dict.fromkeys(allow_rules))
            managed = policy_values(
                {
                    key: permissions.get(key, [])
                    for key in ("allow", "deny", "ask")
                }
            )
            permissions.update(managed)
            document["permissions"] = permissions

            descriptor, staged = tempfile.mkstemp(
                dir=self.path.parent, prefix=".companion-settings-"
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(document, stream, indent=2, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())

            _, latest_rev = self._document()
            if latest_rev != current_revision:
                raise StorageConflict("CLI settings revision conflict")

            if self.path.exists():
                backup = self.path.with_name(self.path.name + ".companion-bak")
                if backup.is_symlink():
                    raise PermissionError("Linked backup cannot be replaced")
                shutil.copy2(self.path, backup)
                os.chmod(backup, 0o600)
            os.chmod(staged, 0o600)
            os.replace(staged, self.path)

            try:
                web_settings_path = self.path.parent / "web_settings.json"
                web_doc = {
                    "model": document.get("model", "gemini-3.8-flash-medium"),
                    "effort": document.get("effort", "medium"),
                    "safe_mode": bool(document.get("safe_mode", True)),
                    "autopilot": not bool(document.get("safe_mode", True)),
                    "allow_commands": "command" in allow_rules or "command(*)" in allow_rules,
                    "allow_write": "file_write" in allow_rules or "write_file(*)" in allow_rules,
                    "allow_web": "web_access" in allow_rules or "read_url(*)" in allow_rules,
                    "allow_subagent": "subagents" in allow_rules or "invoke_subagent(*)" in allow_rules,
                    "allow_schedule": "schedule" in allow_rules or "schedule(*)" in allow_rules,
                    "speech_enabled": bool(document.get("speech_enabled", True)),
                    "tones_enabled": bool(document.get("tones_enabled", True)),
                    "haptic_enabled": bool(document.get("haptic_enabled", True)),
                    "trustedWorkspaces": document.get("trustedWorkspaces", [str(Path.home())]),
                }
                descriptor_web, staged_web = tempfile.mkstemp(
                    dir=self.path.parent, prefix=".companion-web-"
                )
                with os.fdopen(descriptor_web, "w", encoding="utf-8") as stream_web:
                    json.dump(web_doc, stream_web, indent=2, ensure_ascii=False)
                    stream_web.flush()
                    os.fsync(stream_web.fileno())
                os.chmod(staged_web, 0o600)
                os.replace(staged_web, web_settings_path)
            except Exception:
                pass

            return self.read_settings()
        finally:
            if staged is not None:
                Path(staged).unlink(missing_ok=True)
            lock.unlink(missing_ok=True)

