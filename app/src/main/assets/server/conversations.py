#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Conversations History, Subagents, Tasks & System Usage
# ==============================================================================

import os
import sys
import time
import datetime
import json

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import (
    BRAIN_DIR, HOME_DIR, ai_stats_lock, latest_ai_stats,
    subagent_lock, active_subagents_registry, active_tasks_registry,
    send_json_response, logger
)
from security import send_system_broadcast
from models import fetch_antigravity_quota
from settings_manager import load_settings

def handle_conversations_list(client_sock):
    conversations = []
    if os.path.exists(BRAIN_DIR):
        for cid in os.listdir(BRAIN_DIR):
            cpath = os.path.join(BRAIN_DIR, cid)
            tfile = os.path.join(cpath, ".system_generated", "logs", "transcript.jsonl")
            if os.path.exists(tfile):
                try:
                    mtime = os.path.getmtime(tfile)
                    title = ""
                    step_count = 0
                    with open(tfile, "r", encoding="utf-8", errors="ignore") as f:
                        for line in f:
                            step_count += 1
                            if not title:
                                try:
                                    data = json.loads(line)
                                    if data.get("type") == "USER_INPUT":
                                        c = data.get("content", "")
                                        if "<USER_REQUEST>" in c:
                                            c = c.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                                        first_line = c.split("\n")[0].strip()
                                        if first_line:
                                            title = first_line[:60]
                                except Exception:
                                    pass
                    if not title:
                        title = f"محادثة {cid[:8]}"
                    
                    import datetime
                    dt = datetime.datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
                    conversations.append({
                        "id": cid,
                        "title": title,
                        "date": dt,
                        "mtime": mtime,
                        "steps": step_count
                    })
                except Exception:
                    pass
    conversations.sort(key=lambda x: x["mtime"], reverse=True)
    send_json_response(client_sock, {"conversations": conversations[:40]})

def handle_conversation_get(client_sock, cid):
    if not cid:
        send_json_response(client_sock, {"error": "Conversation ID required"}, status_code=400)
        return
    logs_dir = os.path.join(BRAIN_DIR, cid, ".system_generated", "logs")
    tfile = os.path.join(logs_dir, "transcript.jsonl")
    tfull = os.path.join(logs_dir, "transcript_full.jsonl")
    if not os.path.exists(tfile):
        send_json_response(client_sock, {"error": "Conversation not found"}, status_code=404)
        return

    full_lines = {}
    if os.path.exists(tfull):
        try:
            with open(tfull, "r", encoding="utf-8", errors="ignore") as f:
                for idx, line in enumerate(f):
                    full_lines[idx] = line
        except Exception:
            pass

    messages = []
    total_tokens = 0
    current_agent_turn = None

    try:
        with open(tfile, "r", encoding="utf-8", errors="ignore") as f:
            for idx, line in enumerate(f):
                line_str = line.strip()
                if not line_str:
                    continue
                data = json.loads(line_str)
                stype = data.get("type")
                trunc = data.get("truncated_fields", [])

                if trunc and idx in full_lines:
                    try:
                        data = json.loads(full_lines[idx])
                    except Exception:
                        pass

                if stype == "USER_INPUT":
                    if current_agent_turn:
                        messages.append(current_agent_turn)
                        current_agent_turn = None

                    c = data.get("content", "")
                    if "<USER_REQUEST>" in c:
                        c = c.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                    if c:
                        messages.append({
                            "id": f"{cid}_{idx}",
                            "role": "user",
                            "text": c,
                            "time": data.get("created_at", "")
                        })

                elif stype == "PLANNER_RESPONSE":
                    c = data.get("content", "")
                    th = data.get("thinking", "")
                    tool_calls = data.get("tool_calls") or []

                    if current_agent_turn is None:
                        current_agent_turn = {
                            "id": f"{cid}_{idx}",
                            "role": "agent",
                            "text": c,
                            "thinking": th,
                            "tool_count": len(tool_calls),
                            "time": data.get("created_at", "")
                        }
                    else:
                        if th:
                            prev_th = current_agent_turn.get("thinking", "")
                            current_agent_turn["thinking"] = (prev_th + "\n\n" + th).strip() if prev_th else th
                        if c:
                            prev_tx = current_agent_turn.get("text", "")
                            current_agent_turn["text"] = (prev_tx + "\n\n" + c).strip() if prev_tx else c
                        current_agent_turn["tool_count"] = current_agent_turn.get("tool_count", 0) + len(tool_calls)
                        current_agent_turn["time"] = data.get("created_at", "")

                usage = data.get("usage")
                if usage and isinstance(usage, dict):
                    total_tokens = usage.get("total_tokens", total_tokens)

        if current_agent_turn:
            messages.append(current_agent_turn)

        for msg in messages:
            if msg.get("role") == "agent" and not msg.get("text"):
                t_count = msg.get("tool_count", 0)
                if t_count > 0:
                    msg["text"] = f"*(نفّذ الوكيل {t_count} عملية/أداة بنجاح في هذه الخطوة)*"
                elif msg.get("thinking"):
                    msg["text"] = "*(خطوات تفكير وتحليل فقط)*"

    except Exception as e:
        send_json_response(client_sock, {"error": str(e)}, status_code=500)
        return

    send_json_response(client_sock, {
        "id": cid,
        "messages": messages,
        "total_tokens": total_tokens
    })



def handle_system_usage(client_sock):
    ram_total_mb = 0
    ram_used_mb = 0
    ram_avail_mb = 0
    ram_pct = 0
    try:
        with open("/proc/meminfo", "r") as f:
            mem = {}
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    mem[parts[0].strip()] = int(parts[1].strip().split()[0])
            total_kb = mem.get("MemTotal", 0)
            avail_kb = mem.get("MemAvailable", mem.get("MemFree", 0))
            used_kb = total_kb - avail_kb
            ram_total_mb = round(total_kb / 1024)
            ram_avail_mb = round(avail_kb / 1024)
            ram_used_mb = round(used_kb / 1024)
            ram_pct = round((used_kb / total_kb) * 100, 1) if total_kb else 0
    except Exception:
        pass

    disk_total = "0G"
    disk_used = "0G"
    disk_avail = "0G"
    disk_pct = 0
    try:
        st = os.statvfs(HOME_DIR)
        total_b = st.f_blocks * st.f_frsize
        avail_b = st.f_bavail * st.f_frsize
        used_b = total_b - avail_b
        disk_total = f"{round(total_b / (1024**3), 1)}GB"
        disk_avail = f"{round(avail_b / (1024**3), 1)}GB"
        disk_used = f"{round(used_b / (1024**3), 1)}GB"
        disk_pct = round((used_b / total_b) * 100, 1) if total_b else 0
    except Exception:
        pass

    settings = load_settings()
    cur_model = settings.get("model", "gemini-3.8-flash-medium")
    limit = 1048576
    m_lower = cur_model.lower()
    if "claude" in m_lower:
        limit = 200000
    elif "gpt-oss" in m_lower:
        limit = 131072
    elif "gemini" in m_lower:
        limit = 1048576

    with ai_stats_lock:
        ai_info = dict(latest_ai_stats)
        ai_info["model"] = cur_model
        ai_info["context_limit"] = limit
        cur_ctx = ai_info["input_tokens"] + ai_info["output_tokens"]
        ai_info["context_tokens"] = cur_ctx
        ai_info["context_pct"] = round((cur_ctx / limit) * 100, 2) if limit else 0
        ai_info["remaining_tokens"] = max(0, limit - cur_ctx)

    send_json_response(client_sock, {
        "ai": ai_info,
        "quotas": fetch_antigravity_quota(force=False),
        "ram": {
            "total_mb": ram_total_mb,
            "used_mb": ram_used_mb,
            "avail_mb": ram_avail_mb,
            "pct": ram_pct
        },
        "disk": {
            "total": disk_total,
            "used": disk_used,
            "avail": disk_avail,
            "pct": disk_pct
        }
    })

def handle_subagents_list(client_sock):
    with subagent_lock:
        agents = list(active_subagents_registry.values())
    agents.sort(key=lambda x: x.get("started_at", 0), reverse=True)
    send_json_response(client_sock, {"status": "ok", "subagents": agents, "count": len(agents)})

def handle_subagents_manage(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        action = data.get("action", "")
        agent_id = data.get("agent_id", "")
        if (action == "kill" or not action) and agent_id in active_subagents_registry:
            with subagent_lock:
                active_subagents_registry[agent_id]["state"] = "CANCELLED"
            send_json_response(client_sock, {"status": "ok", "message": f"Subagent {agent_id} cancelled"})
            return
        send_json_response(client_sock, {"status": "ok", "action": action, "agent_id": agent_id})
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)

def handle_tasks_list(client_sock):
    now = time.time()
    with subagent_lock:
        for t_id, task in list(active_tasks_registry.items()):
            if task.get("status") == "active":
                dur = task.get("duration")
                if dur is not None:
                    try:
                        dur_sec = float(dur)
                        created = float(task.get("created_at", now))
                        rem = max(0, int((created + dur_sec) - now))
                        task["remaining_seconds"] = rem
                        if now >= created + dur_sec:
                            task["status"] = "completed"
                            task["completed_at"] = now
                            p_snippet = str(task.get("prompt", "")).strip()
                            if len(p_snippet) > 100:
                                p_snippet = p_snippet[:100] + "..."
                            send_system_broadcast("done", f"اكتملت المهمة المجدولة: {p_snippet}", urgent=False)
                    except Exception:
                        pass
        tasks = list(active_tasks_registry.values())
    tasks.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    active_count = sum(1 for t in tasks if t.get("status") == "active")
    send_json_response(client_sock, {
        "status": "ok",
        "tasks": tasks,
        "count": len(tasks),
        "active_count": active_count
    })

def handle_tasks_manage(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        action = data.get("action", "")
        task_id = data.get("task_id", "")
        with subagent_lock:
            if action == "kill" and task_id in active_tasks_registry:
                active_tasks_registry[task_id]["status"] = "cancelled"
                send_json_response(client_sock, {"status": "ok", "message": f"Task {task_id} cancelled"})
                return
            elif action in ("clear_completed", "delete") and task_id in active_tasks_registry:
                del active_tasks_registry[task_id]
                send_json_response(client_sock, {"status": "ok", "message": f"Task {task_id} removed"})
                return
            elif action == "clear_all":
                active_tasks_registry.clear()
                send_json_response(client_sock, {"status": "ok", "message": "All tasks cleared"})
                return
        send_json_response(client_sock, {"status": "ok", "action": action, "task_id": task_id})
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)

