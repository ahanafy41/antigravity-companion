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

    def listing(self, metadata_store=None):
        try:
            folders = list(self.root.iterdir())
        except FileNotFoundError:
            return []
        candidates = []
        for folder in folders:
            tfile = folder / ".system_generated" / "logs" / "transcript.jsonl"
            if tfile.is_file():
                try:
                    candidates.append((folder.name, tfile, tfile.stat().st_mtime))
                except OSError:
                    pass
        candidates.sort(key=lambda x: x[2], reverse=True)
        conversations = []
        import datetime
        for cid, tfile, mtime in candidates[:100]:
            if metadata_store and metadata_store.is_deleted(cid):
                continue
            try:
                title = ""
                step_count = 0
                meta = metadata_store.get(cid) if metadata_store else {}
                if meta and meta.get("title"):
                    title = meta["title"]
                with tfile.open("r", encoding="utf-8-sig", errors="ignore") as f:
                    for line in f:
                        step_count += 1
                        if not title:
                            try:
                                data = json.loads(line)
                                if data.get("type") == "USER_INPUT":
                                    c = data.get("content", "")
                                    if "<USER_REQUEST>" in c:
                                        c = c.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                                    clean_text = re.sub(r"<[^>]+>", " ", c).strip()
                                    clean_text = re.sub(r"^(?:/[a-zA-Z0-9_\.\-]+(?:\s*))+", "", clean_text).strip()
                                    for l in clean_text.split("\n"):
                                        l = l.strip()
                                        if l and not l.startswith("/"):
                                            title = l[:60]
                                            break
                                    if not title:
                                        first_l = c.split("\n")[0].strip()
                                        if first_l.startswith("/"):
                                            cmd = first_l.split()[0].lstrip("/")
                                            title = f"أمر: {cmd}"
                            except Exception:
                                pass
                if not title:
                    title = "محادثة سابقة"
                dt = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
                is_pinned = bool(meta.get("is_pinned", False)) if meta else False
                pinned_at = meta.get("pinned_at") if meta else None
                conversations.append(
                    {
                        "conversation_id": cid,
                        "id": cid,
                        "title": title,
                        "date": dt,
                        "mtime": mtime,
                        "steps": step_count,
                        "is_pinned": is_pinned,
                        "pinned_at": pinned_at,
                    }
                )
            except Exception as failure:
                print(
                    "Legacy transcript skipped: " + type(failure).__name__,
                    file=sys.stderr,
                )
        conversations.sort(
            key=lambda c: (1 if c.get("is_pinned") else 0, c.get("pinned_at") or c.get("mtime") or 0),
            reverse=True,
        )
        return conversations

    def transcript(self, conversation_id):
        path = self.transcript_path(conversation_id)
        logs_dir = path.parent
        full_path = logs_dir / "transcript_full.jsonl"
        full_lines = {}
        if full_path.is_file():
            try:
                with full_path.open("r", encoding="utf-8-sig", errors="ignore") as f:
                    for idx, line in enumerate(f):
                        full_lines[idx] = line
            except Exception:
                pass

        records, total, skipped = [], 0, 0
        truncated = False
        messages = []
        current_agent_turn = None
        total_tokens = 0

        with path.open("r", encoding="utf-8-sig", errors="ignore") as stream:
            for idx, line in enumerate(stream):
                total += len(line.encode("utf-8"))
                if total > MAX_BYTES:
                    truncated = True
                    break
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    data = json.loads(line_str)
                except Exception:
                    skipped += 1
                    continue
                if not isinstance(data, dict):
                    skipped += 1
                    continue
                records.append(data)

                trunc = data.get("truncated_fields", [])
                if trunc and idx in full_lines:
                    try:
                        full_data = json.loads(full_lines[idx])
                        if isinstance(full_data, dict):
                            data = full_data
                    except Exception:
                        pass

                stype = data.get("type")
                source = data.get("source", "")
                if stype == "USER_INPUT":
                    c = data.get("content", "")
                    is_explicit_user = "<USER_REQUEST>" in c or source == "USER_EXPLICIT" or not (current_agent_turn and current_agent_turn.get("tools"))
                    if is_explicit_user:
                        if current_agent_turn:
                            messages.append(current_agent_turn)
                            current_agent_turn = None
                        user_req = c
                        if "<USER_REQUEST>" in c:
                            user_req = c.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                        if user_req:
                            messages.append({
                                "id": f"{conversation_id}_{idx}",
                                "role": "user",
                                "text": user_req,
                                "time": data.get("created_at", ""),
                            })
                    else:
                        # Tool execution output fed back as USER_INPUT
                        if current_agent_turn and current_agent_turn.get("tools"):
                            last_tool = current_agent_turn["tools"][-1]
                            if not last_tool.get("preview") and c:
                                last_tool["preview"] = c[:500]
                elif stype == "GENERIC":
                    # Tool stdout/stderr or command output
                    c = data.get("content", "")
                    if current_agent_turn and current_agent_turn.get("tools") and c:
                        last_tool = current_agent_turn["tools"][-1]
                        if not last_tool.get("preview"):
                            last_tool["preview"] = c[:500]
                elif stype == "PLANNER_RESPONSE":
                    c = data.get("content", "")
                    th = data.get("thinking", "")
                    tool_calls = data.get("tool_calls") or []
                    extracted_tools = []
                    for tc in tool_calls:
                        t_name = tc.get("name") or "tool"
                        t_args = tc.get("args") or {}
                        if isinstance(t_args, str):
                            try:
                                t_args = json.loads(t_args)
                            except Exception:
                                t_args = {}
                        summary = t_args.get("toolSummary") or t_args.get("description") or t_args.get("CommandLine") or t_args.get("Path") or t_name
                        extracted_tools.append({
                            "name": t_name,
                            "args": t_args,
                            "summary": str(summary).strip('"\''),
                            "status": "completed",
                        })

                    if current_agent_turn is None:
                        current_agent_turn = {
                            "id": f"{conversation_id}_{idx}",
                            "role": "agent",
                            "text": c,
                            "thinking": th,
                            "tool_count": len(tool_calls),
                            "tools": extracted_tools,
                            "time": data.get("created_at", ""),
                        }
                    else:
                        if th:
                            prev_th = current_agent_turn.get("thinking", "")
                            current_agent_turn["thinking"] = (
                                prev_th + "\n\n" + th
                            ).strip() if prev_th else th
                        if c:
                            prev_tx = current_agent_turn.get("text", "")
                            current_agent_turn["text"] = (
                                prev_tx + "\n\n" + c
                            ).strip() if prev_tx else c
                        current_agent_turn["tool_count"] = (
                            current_agent_turn.get("tool_count", 0) + len(tool_calls)
                        )
                        if extracted_tools:
                            prev_tools = current_agent_turn.get("tools", [])
                            prev_tools.extend(extracted_tools)
                            current_agent_turn["tools"] = prev_tools
                        current_agent_turn["time"] = data.get("created_at", "")

                usage = data.get("usage")
                if usage and isinstance(usage, dict):
                    total_tokens = usage.get("total_tokens", total_tokens)

        if current_agent_turn:
            messages.append(current_agent_turn)

        for msg in messages:
            if msg.get("role") == "agent" and not msg.get("text"):
                tools_list = msg.get("tools") or []
                t_count = msg.get("tool_count", 0) or len(tools_list)
                if t_count > 0:
                    msg["terminal_status"] = "completed_tools"
                    msg["text"] = ""
                elif msg.get("thinking"):
                    msg["terminal_status"] = "thinking_only"
                    msg["text"] = ""

        artifacts = self.artifacts(conversation_id)

        # Discover and populate nested subagent runs and tools
        subagents = []
        pending_invocations = []
        for rec in records:
            rtype = rec.get("type")
            if rtype == "PLANNER_RESPONSE":
                for tc in (rec.get("tool_calls") or []):
                    if tc.get("name") == "invoke_subagent":
                        args = tc.get("args") or {}
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except Exception:
                                pass
                        role = ""
                        tname = ""
                        prompt = ""
                        sub_list = args.get("Subagents", [])
                        if isinstance(sub_list, list) and len(sub_list) > 0 and isinstance(sub_list[0], dict):
                            first = sub_list[0]
                            role = str(first.get("Role") or first.get("role") or first.get("TypeName") or first.get("type_name") or "").strip().strip('"').strip("'")
                            tname = str(first.get("TypeName") or first.get("type_name") or "").strip().strip('"').strip("'")
                            prompt = str(first.get("Prompt") or first.get("prompt") or "").strip().strip('"').strip("'")
                        if not role:
                            role = str(args.get("Role") or args.get("role") or args.get("TypeName") or args.get("type_name") or "وكيل فرعي").strip().strip('"').strip("'")
                        if not tname:
                            tname = str(args.get("TypeName") or args.get("type_name") or "subagent").strip().strip('"').strip("'")
                        if not prompt:
                            prompt = str(args.get("Prompt") or args.get("prompt") or "").strip().strip('"').strip("'")
                        pending_invocations.append({"role": role, "type_name": tname, "prompt": prompt})
            elif rtype in ("GENERIC", "TOOL_RESULT", "TOOL_OUTPUT") and pending_invocations:
                cnt = str(rec.get("content") or "")
                cid_m = re.search(r'["\']?conversationId["\']?\s*:\s*["\']([a-fA-F0-9-]{32,36})["\']', cnt)
                if not cid_m:
                    cid_m = re.search(r'["\']?conversation_id["\']?\s*:\s*["\']([a-fA-F0-9-]{32,36})["\']', cnt)
                if cid_m:
                    inv = pending_invocations.pop(0)
                    child_cid = cid_m.group(1)
                    subagents.append({
                        "conversation_id": child_cid,
                        "role": inv["role"],
                        "type_name": inv["type_name"],
                        "prompt": inv["prompt"],
                    })

        for sub in subagents:
            sub["tools"] = []
            sub["thinking"] = ""
            sub["response"] = ""
            child_path = self.root / sub["conversation_id"] / ".system_generated" / "logs" / "transcript.jsonl"
            if child_path.is_file():
                try:
                    c_pending_tools = []
                    with child_path.open("r", encoding="utf-8-sig", errors="ignore") as c_stream:
                        for c_line in c_stream:
                            c_str = c_line.strip()
                            if not c_str:
                                continue
                            try:
                                c_data = json.loads(c_str)
                            except Exception:
                                continue
                            if not isinstance(c_data, dict):
                                continue
                            c_type = c_data.get("type")
                            if c_type == "PLANNER_RESPONSE":
                                if c_data.get("thinking"):
                                    th = c_data["thinking"]
                                    sub["thinking"] = (sub["thinking"] + "\n\n" + th).strip() if sub["thinking"] else th
                                if c_data.get("content"):
                                    ct = c_data["content"]
                                    sub["response"] = (sub["response"] + "\n\n" + ct).strip() if sub["response"] else ct
                                for tc in (c_data.get("tool_calls") or []):
                                    t_args = tc.get("args") or {}
                                    if isinstance(t_args, str):
                                        try:
                                            t_args = json.loads(t_args)
                                        except Exception:
                                            pass
                                    tool_item = {
                                        "name": tc.get("name") or "",
                                        "parameters": t_args,
                                        "step_index": c_data.get("step_index"),
                                        "output": "",
                                    }
                                    c_pending_tools.append(tool_item)
                                    sub["tools"].append(tool_item)
                            elif c_type in ("GENERIC", "TOOL_RESULT", "TOOL_OUTPUT") and c_pending_tools:
                                out = c_data.get("content") or ""
                                if isinstance(out, (dict, list)):
                                    out = json.dumps(out, ensure_ascii=False)
                                out_str = str(out).strip()
                                MAX_TOOL_OUTPUT = 16384
                                if len(out_str) > MAX_TOOL_OUTPUT:
                                    out_str = out_str[:MAX_TOOL_OUTPUT] + "\n... [تم اختصار العرض المباشر]"
                                matched = c_pending_tools.pop(0)
                                matched["output"] = out_str
                except Exception:
                    pass

        return {
            "conversation_id": conversation_id,
            "id": conversation_id,
            "records": records,
            "messages": messages,
            "artifacts": artifacts,
            "subagents": subagents,
            "total_tokens": total_tokens,
            "truncated": truncated,
            "invalid_records": skipped,
        }

    def artifacts(self, conversation_id):
        b_dir = self.root / conversation_id
        if not b_dir.is_dir():
            return []
        artifacts = []
        try:
            for item in b_dir.iterdir():
                if item.name.endswith(".metadata.json"):
                    base_name = item.name[:-14]
                    doc_path = b_dir / base_name
                    if doc_path.exists():
                        try:
                            mdata = json.loads(
                                item.read_text(encoding="utf-8", errors="ignore")
                            )
                        except Exception:
                            mdata = {}
                        st = doc_path.stat()
                        artifacts.append({
                            "name": base_name,
                            "summary": mdata.get("summary", "") or mdata.get("Summary", ""),
                            "requestFeedback": bool(
                                mdata.get("requestFeedback", False)
                                or mdata.get("RequestFeedback", False)
                            ),
                            "userFacing": bool(
                                mdata.get("userFacing", True)
                                if "userFacing" in mdata
                                else mdata.get("UserFacing", True)
                            ),
                            "updatedAt": mdata.get("updatedAt", ""),
                            "mtime": st.st_mtime,
                            "size": st.st_size,
                            "path": str(doc_path),
                        })
        except Exception:
            pass
        artifacts.sort(key=lambda x: x.get("mtime", 0), reverse=True)
        return artifacts
