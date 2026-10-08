"""Read authenticated-owner history without modifying CLI transcripts."""

import json
from pathlib import Path
import re
import sys

MAX_BYTES = 1024 * 1024


class LegacyConversations:
    def __init__(self, home):
        self.root = Path(home) / ".gemini" / "antigravity-cli" / "brain"

    def transcript_path(self, conversation_id):
        if (
            not isinstance(conversation_id, str)
            or conversation_id in (".", "..")
            or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", conversation_id)
        ):
            raise ValueError("Invalid conversation ID")
        root = self.root.resolve()
        path = (
            root
            / conversation_id
            / ".system_generated"
            / "logs"
            / "transcript.jsonl"
        ).resolve()
        if root not in path.parents:
            raise PermissionError("Legacy transcript escapes its root")
        if not path.is_file():
            raise FileNotFoundError("Legacy transcript does not exist")
        return path

    def listing(self):
        try:
            folders = list(self.root.iterdir())
        except FileNotFoundError:
            return []
        conversations = []
        for folder in folders:
            try:
                path = self.transcript_path(folder.name)
                transcript = self.transcript(folder.name)
                title = next(
                    (
                        record["content"].split("\n", 1)[0][:120]
                        for record in transcript["records"]
                        if isinstance(record, dict)
                        and record.get("type") == "USER_INPUT"
                        and isinstance(record.get("content"), str)
                    ),
                    folder.name,
                )
                conversations.append(
                    {
                        "conversation_id": folder.name,
                        "title": title,
                        "mtime": path.stat().st_mtime,
                    }
                )
            except (OSError, ValueError, UnicodeError) as failure:
                print(
                    "Legacy transcript skipped: " + type(failure).__name__,
                    file=sys.stderr,
                )
        return sorted(
            conversations, key=lambda record: record["mtime"], reverse=True
        )[:100]

    def transcript(self, conversation_id):
        path = self.transcript_path(conversation_id)
        records, total, skipped = [], 0, 0
        truncated = False
        with path.open("rb") as stream:
            while line := stream.readline(MAX_BYTES + 1):
                total += len(line)
                if total > MAX_BYTES:
                    truncated = True
                    break
                try:
                    records.append(
                        json.loads(line.decode("utf-8-sig"), strict=False)
                    )
                except (json.JSONDecodeError, UnicodeError):
                    skipped += 1
                    print("Malformed legacy record skipped", file=sys.stderr)
        return {
            "conversation_id": conversation_id,
            "records": records,
            "truncated": truncated,
            "invalid_records": skipped,
        }
