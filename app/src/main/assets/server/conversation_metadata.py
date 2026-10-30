from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


class ConversationMetadataStore:
    """Lightweight, resilient JSON metadata store for conversation titles, pins, and deletion status."""

    def __init__(self, file_path: Path):
        self.file_path = Path(file_path)
        self._ensure_file()

    def _ensure_file(self) -> None:
        if not self.file_path.exists():
            try:
                self.file_path.parent.mkdir(parents=True, exist_ok=True)
                self.file_path.write_text("{}", encoding="utf-8")
            except Exception:
                pass

    def get_all(self) -> Dict[str, Dict[str, Any]]:
        if not self.file_path.exists():
            return {}
        try:
            content = self.file_path.read_text(encoding="utf-8").strip()
            if not content:
                return {}
            data = json.loads(content)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def get(self, conversation_id: str) -> Dict[str, Any]:
        return self.get_all().get(conversation_id, {})

    def is_deleted(self, conversation_id: str) -> bool:
        entry = self.get(conversation_id)
        return bool(entry.get("is_deleted", False))

    def update(
        self,
        conversation_id: str,
        title: Optional[str] = None,
        is_pinned: Optional[bool] = None,
        is_deleted: Optional[bool] = None,
    ) -> Dict[str, Any]:
        data = self.get_all()
        entry = data.get(conversation_id, {
            "conversation_id": conversation_id,
            "created_at": time.time(),
        })

        if title is not None:
            entry["title"] = str(title).strip()
        if is_pinned is not None:
            entry["is_pinned"] = bool(is_pinned)
            if is_pinned:
                entry["pinned_at"] = time.time()
            else:
                entry.pop("pinned_at", None)
        if is_deleted is not None:
            entry["is_deleted"] = bool(is_deleted)
            if is_deleted:
                entry["deleted_at"] = time.time()
            else:
                entry.pop("deleted_at", None)

        entry["updated_at"] = time.time()
        data[conversation_id] = entry
        self._save(data)
        return entry

    def mark_deleted(self, conversation_id: str) -> None:
        self.update(conversation_id, is_deleted=True)

    def _save(self, data: Dict[str, Any]) -> None:
        try:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self.file_path.with_suffix(".tmp")
            tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp_path.replace(self.file_path)
        except Exception:
            pass
