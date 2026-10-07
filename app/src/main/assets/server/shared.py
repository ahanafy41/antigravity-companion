#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Shared Utilities & State
# ==============================================================================

import os
import sys
import time
import json
import logging
import threading
import shutil
import subprocess

# Ensure server directory is in sys.path
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("termux-accessible-web")

BASE_DIR = SERVER_DIR
INDEX_FILE = os.path.join(BASE_DIR, "web", "index.html")
STOCK_FILE = os.path.join(BASE_DIR, "ttyd_stock.html")
SETTINGS_FILE = os.path.expanduser("~/.gemini/antigravity-cli/settings.json")
WEB_SETTINGS_FILE = os.path.expanduser("~/.gemini/antigravity-cli/web_settings.json")
CONFIG_FILE = os.path.expanduser("~/.gemini/config/config.json")
CONFIG_JSON_FILE = os.path.expanduser("~/.gemini/config/config.json")
PLUGINS_DIR = os.path.expanduser("~/.gemini/config/plugins")
BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity-cli/brain")
HOME_DIR = os.path.expanduser("~")
AUTH_TOKEN_FILE = os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
STATE_FILE = "/sdcard/解说/Plugins/antigravity/state.json"
MCP_CONFIG_PATH = os.path.expanduser("~/.gemini/config/mcp_config.json")

ttyd_process = None
active_ai_process = None
ai_process_lock = threading.Lock()

# AI Token & Quota Tracking
ai_stats_lock = threading.Lock()
latest_ai_stats = {
    "total_session_tokens": 0,
    "last_tokens": 0,
    "input_tokens": 0,
    "output_tokens": 0,
    "thinking_tokens": 0,
    "cache_read_tokens": 0,
    "duration_seconds": 0,
    "total_requests": 0
}

# Subagents & Background Tasks Registry
subagent_lock = threading.Lock()
active_subagents_registry = {}  # agent_id -> dict
active_tasks_registry = {}      # task_id -> dict

def register_live_subagent(agent_id, role, type_name, prompt, conv_id=""):
    with subagent_lock:
        active_subagents_registry[agent_id] = {
            "id": agent_id,
            "role": role or "Subagent",
            "type": type_name or "subagent",
            "prompt": prompt or "",
            "state": "RUNNING",
            "conversation_id": conv_id,
            "last_message": "",
            "last_action": "Spawned & executing task",
            "started_at": time.time(),
            "steps": []
        }

def update_live_subagent_state(agent_id, state, last_action=None, message=None):
    with subagent_lock:
        if agent_id in active_subagents_registry:
            active_subagents_registry[agent_id]["state"] = state
            if last_action:
                active_subagents_registry[agent_id]["last_action"] = last_action
            if message:
                active_subagents_registry[agent_id]["last_message"] = message

def _background_task_watcher():
    """Background watcher that automatically updates expired timer tasks and broadcasts notifications."""
    while True:
        try:
            time.sleep(2.0)
            now = time.time()
            with subagent_lock:
                for t_id, task in list(active_tasks_registry.items()):
                    if task.get("status") == "active":
                        dur = task.get("duration")
                        if dur is not None:
                            try:
                                dur_sec = float(dur)
                                created = float(task.get("created_at", now))
                                if now >= created + dur_sec:
                                    task["status"] = "completed"
                                    task["completed_at"] = now
                                    task["remaining_seconds"] = 0
                                    p_snippet = str(task.get("prompt", "")).strip()
                                    if len(p_snippet) > 100:
                                        p_snippet = p_snippet[:100] + "..."
                                    from security import send_system_broadcast
                                    send_system_broadcast("done", f"اكتملت المهمة المجدولة: {p_snippet}", urgent=False)
                            except Exception:
                                pass
        except Exception:
            pass

_watcher_thread = threading.Thread(target=_background_task_watcher, daemon=True, name="BackgroundTaskWatcher")
_watcher_thread.start()

def get_agy_binary_path():
    """Resolve the agy executable path reliably across Termux and standard paths."""
    which_path = shutil.which("agy")
    if which_path and os.path.isfile(which_path) and os.access(which_path, os.X_OK):
        return which_path

    known_paths = [
        "/data/data/com.termux/files/usr/bin/agy",
        os.path.expanduser("~/.gemini/antigravity-cli/bin/agy"),
        os.path.expanduser("~/.local/bin/agy"),
        "/usr/local/bin/agy",
        "/usr/bin/agy"
    ]
    for p in known_paths:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return "agy"

def get_index_bytes():
    try:
        with open(INDEX_FILE, "rb") as f:
            return f.read()
    except Exception:
        return b"<h1>Error loading accessible UI</h1>"

def get_stock_bytes():
    if os.path.exists(STOCK_FILE):
        try:
            with open(STOCK_FILE, "rb") as f:
                return f.read()
        except Exception:
            pass
    return get_index_bytes()

def send_json_response(sock, data, status_code=200, status_text="OK"):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    header = (
        f"HTTP/1.1 {status_code} {status_text}\r\n"
        f"Content-Type: application/json; charset=utf-8\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Access-Control-Allow-Origin: *\r\n"
        f"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        f"Access-Control-Allow-Headers: Content-Type\r\n"
        f"Connection: close\r\n\r\n"
    ).encode("utf-8")
    sock.sendall(header + body)
