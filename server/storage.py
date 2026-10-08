"""Atomic local documents, revision conflicts, and workspace confinement."""

import json
import os
from pathlib import Path
import shutil
import tempfile


class StorageConflict(Exception):
    """The document changed since the caller read it."""


class AtomicStore:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, name):
        if not name.replace("-", "").replace("_", "").isalnum():
            raise ValueError("Invalid document name")
        return self.root / (name + ".json")

    def read(self, name):
        try:
            return json.loads(self.path(name).read_text(encoding="utf-8-sig"))
        except FileNotFoundError:
            return {"revision": 0}
        except (json.JSONDecodeError, UnicodeError):
            backup = Path(str(self.path(name)) + ".bak")
            return json.loads(backup.read_text(encoding="utf-8-sig"))

    def write(self, name, document):
        target = self.path(name)
        descriptor, staged = tempfile.mkstemp(dir=self.root, prefix=".write-")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump(document, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            if target.exists():
                try:
                    json.loads(target.read_text(encoding="utf-8-sig"))
                except (json.JSONDecodeError, UnicodeError):
                    shutil.copy2(target, str(target) + ".corrupt")
                else:
                    shutil.copy2(target, str(target) + ".bak")
            os.replace(staged, target)
        finally:
            Path(staged).unlink(missing_ok=True)

    def update(self, name, patch, revision):
        current = self.read(name)
        if current.get("revision", 0) != revision:
            raise StorageConflict("Revision conflict")
        current = merge_document(current, patch)
        current["revision"] = revision + 1
        self.write(name, current)
        return current

    def import_legacy(self, home):
        target = self.path("settings")
        if target.exists():
            return
        directory = Path(home) / ".gemini" / "antigravity-cli"
        merged = {}
        for filename in ("settings.json", "web_settings.json"):
            try:
                original = json.loads(
                    (directory / filename).read_text(encoding="utf-8-sig")
                )
            except FileNotFoundError:
                continue
            if not isinstance(original, dict):
                raise ValueError("Legacy settings must be an object")
            merged.update(original)
        if merged:
            merged["revision"] = 0
            self.write("settings", merged)


class WorkspacePaths:
    def __init__(self, roots):
        self.roots = [Path(root).expanduser().resolve() for root in roots]

    def resolve(self, requested):
        path = Path(requested).expanduser().resolve()
        if not any(
            path == root or root in path.parents for root in self.roots
        ):
            raise PermissionError("Path is outside configured workspaces")
        return path


def redact(document):
    if isinstance(document, dict):
        return {
            key: "[redacted]" if secret_key(key) else redact(content)
            for key, content in document.items()
        }
    if isinstance(document, list):
        return [redact(content) for content in document]
    return document


def secret_key(key):
    lowered = key.lower().replace("-", "_")
    return any(
        token in lowered
        for token in ("token", "secret", "password", "credential", "api_key")
    ) or lowered in ("env", "headers", "authorization")


def merge_document(original, patch):
    merged = dict(original)
    for key, content in patch.items():
        if isinstance(content, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge_document(merged[key], content)
        elif content != "[redacted]":
            merged[key] = content
    return merged


def public_document(document):
    if isinstance(document, dict):
        return {
            key: public_document(content)
            for key, content in document.items()
            if not secret_key(key)
        }
    if isinstance(document, list):
        return [public_document(content) for content in document]
    return document
