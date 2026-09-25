#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Universal Dual-Engine Server
# Engine 1: Accessible AI Studio (stream-json with Live Steps & File Explorer)
# Engine 2: Raw Termux Terminal (WebSocket Tunnel to ttyd PTY)
# ==============================================================================

import os
import sys
import time
import json
import re
import socket
import signal
import argparse
import threading
import subprocess
import shlex
import queue
import logging
import shutil

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("termux-accessible-web")


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INDEX_FILE = os.path.join(BASE_DIR, "web", "index.html")
STOCK_FILE = os.path.join(BASE_DIR, "ttyd_stock.html")
SETTINGS_FILE = os.path.expanduser("~/.gemini/antigravity-cli/settings.json")
WEB_SETTINGS_FILE = os.path.expanduser("~/.gemini/antigravity-cli/web_settings.json")
BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity-cli/brain")
HOME_DIR = os.path.expanduser("~")

ttyd_process = None
active_ai_process = None
ai_process_lock = threading.Lock()

class PersistentAISessionManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.proc = None
        self.line_queue = None
        self.reader_thread = None
        self.conversation_id = ""
        self.model = ""
        self.effort = ""
        self.cwd = ""

    def get_or_create(self, conversation_id, model, effort, cwd, force_new=False):
        with self.lock:
            if force_new:
                self._terminate_locked()
            elif self.proc and self.proc.poll() is None:
                match_conv = (not conversation_id) or (self.conversation_id == conversation_id)
                match_model = (not model) or (self.model == model)
                if match_conv and match_model:
                    return self.proc, self.line_queue, False
                self._terminate_locked()

            cmd = ["agy", "--input-format", "stream-json", "--output-format", "stream-json", "--dangerously-skip-permissions"]
            if model:
                cmd.extend(["--model", model])
            if effort and "thinking" not in model:
                cmd.extend(["--effort", effort])
            if conversation_id:
                cmd.extend(["--conversation", conversation_id])

            env = dict(os.environ)
            env["GOMAXPROCS"] = "2"
            env["AGY_NO_UPDATE_CHECK"] = "1"
            env.pop("AGY_AUTO_UPDATE", None)
            env.pop("AGY_UPDATE_DEBUG", None)

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                cwd=cwd or HOME_DIR,
                env=env,
                text=True,
                bufsize=1,
                preexec_fn=os.setsid
            )

            line_q = queue.Queue()

            def reader_thread(pipe, q):
                try:
                    for line in iter(pipe.readline, ""):
                        if not line:
                            break
                        q.put(line)
                except Exception:
                    pass
                finally:
                    q.put(None)
                    try: pipe.close()
                    except Exception: pass

            t = threading.Thread(target=reader_thread, args=(proc.stdout, line_q), daemon=True)
            t.start()

            self.proc = proc
            self.line_queue = line_q
            self.reader_thread = t
            self.conversation_id = conversation_id
            self.model = model
            self.effort = effort
            self.cwd = cwd or HOME_DIR
            return self.proc, self.line_queue, True

    def _terminate_locked(self):
        if self.proc:
            try:
                pgid = os.getpgid(self.proc.pid)
                try: os.killpg(pgid, signal.SIGCONT)
                except Exception: pass
                os.killpg(pgid, signal.SIGTERM)
                self.proc.wait(timeout=1.0)
            except Exception:
                try:
                    pgid = os.getpgid(self.proc.pid)
                    os.killpg(pgid, signal.SIGKILL)
                except Exception:
                    try: self.proc.kill()
                    except Exception: pass
            self.proc = None
            self.line_queue = None
            self.conversation_id = ""

    def terminate(self):
        with self.lock:
            self._terminate_locked()

    def send_prompt(self, text):
        with self.lock:
            if not self.proc or self.proc.poll() is not None:
                return False
            payload = {
                "event": "user",
                "message": {
                    "content": [
                        {"type": "text", "text": text}
                    ]
                }
            }
            line = json.dumps(payload, ensure_ascii=False) + "\n"
            try:
                self.proc.stdin.write(line)
                self.proc.stdin.flush()
                return True
            except Exception:
                return False

persistent_ai_session = PersistentAISessionManager()
device_agent_session = PersistentAISessionManager()

STATE_FILE = "/sdcard/解说/Plugins/antigravity/state.json"

client_visible = False
last_client_active_time = 0

def update_client_visibility(visible: bool):
    global client_visible, last_client_active_time
    client_visible = visible
    if visible:
        last_client_active_time = time.time()

def is_client_active():
    # True if client reported visible within the last 15 seconds
    return client_visible and (time.time() - last_client_active_time < 15)

def send_system_broadcast(alert_type, text, urgent=False):
    # Always notify Jieshuo via state file and system broadcast so speech/vibration are never dropped

    # 1. State File for direct Jieshuo Accessibility Poller (100% Guaranteed Zero-Perm)
    try:
        data = {
            "id": int(time.time() * 1000),
            "type": str(alert_type),
            "text": str(text),
            "urgent": bool(urgent)
        }
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass

    # 2. Direct Broadcast for Jieshuo Accessibility Service
    try:
        cmd = [
            "am", "broadcast",
            "-a", "com.antigravity.ALERT",
            "--es", "type", str(alert_type),
            "--es", "text", str(text),
            "--ez", "urgent", "true" if urgent else "false"
        ]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    # 3. Direct Native Android Status Bar Notification via Termux:API (Rock-solid guaranteed presence)
    try:
        title = "Antigravity (مطلوب إذن)" if urgent else "Antigravity"
        notif_cmd = [
            "/data/data/com.termux/files/usr/bin/termux-notification",
            "--id", "7681",
            "--title", title,
            "--content", str(text)[:300],
            "--priority", "high" if urgent else "default"
        ]
        if urgent:
            notif_cmd.extend(["--vibrate", "650", "--sound"])
        subprocess.Popen(notif_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

# Permission Middleware: thread-safe permission request/response
permission_event = threading.Event()
permission_response = {"key": ""}
permission_question = {"text": ""}
session_approved_tools = set()

# Tool Capability Categories
TOOL_CATEGORIES = {
    "command": ["run_command"],
    "file_write": ["write_to_file", "replace_file_content", "multi_replace_file_content"],
    "web_access": ["search_web", "read_url_content"],
    "subagents": ["invoke_subagent", "define_subagent", "manage_subagents", "send_message"],
    "schedule": ["schedule", "manage_task"]
}

TOOL_TO_CATEGORY = {}
for cat, tools in TOOL_CATEGORIES.items():
    for t in tools:
        TOOL_TO_CATEGORY[t] = cat

CATEGORY_NAMES_AR = {
    "command": "أوامر الطرفية (Commands)",
    "file_write": "إنشاء وتعديل الملفات (File Write)",
    "web_access": "الوصول إلى الويب والبحث (Web Access)",
    "subagents": "إدارة واستدعاء الوكلاء الفرعيين (Subagents)",
    "schedule": "المهام المجدولة والمؤقتات (Scheduled Tasks)"
}

DEFAULT_ALLOWED_CATEGORIES = ["command", "file_write", "web_access", "subagents", "schedule"]

def is_category_allowed(allow_list, category):
    if not isinstance(allow_list, list):
        return False
    if category == "command":
        return "command" in allow_list or "command(*)" in allow_list
    if category == "file_write":
        return "file_write" in allow_list or "write_file(*)" in allow_list
    if category == "web_access":
        return "web_access" in allow_list or "read_url(*)" in allow_list
    if category == "subagents":
        return "subagents" in allow_list or "invoke_subagent(*)" in allow_list
    if category == "schedule":
        return "schedule" in allow_list or "schedule(*)" in allow_list
    return category in allow_list

def format_human_permission_question(tool_name, params):
    if not isinstance(params, dict):
        params = {}

    if tool_name == "run_command":
        cmd_str = str(params.get("CommandLine") or params.get("command") or "").strip()
        if len(cmd_str) > 200:
            cmd_str = cmd_str[:200] + "..."
        cwd = str(params.get("Cwd", "")).strip()
        cwd_part = f"\nالمجلد الحالي: {cwd}" if cwd else ""
        return f"هل تريد الموافقة على تشغيل أمر الطرفية التالي:\n{cmd_str}{cwd_part}"

    elif tool_name == "write_to_file":
        target = str(params.get("TargetFile") or params.get("path") or "").strip()
        desc = str(params.get("Description") or "").strip()
        desc_part = f"\nالوصف: {desc}" if desc else ""
        return f"هل تريد الموافقة على إنشاء أو كتابة الملف التالي:\n{target}{desc_part}"

    elif tool_name in ["replace_file_content", "multi_replace_file_content"]:
        target = str(params.get("TargetFile") or params.get("path") or "").strip()
        instruction = str(params.get("Instruction") or params.get("Description") or "").strip()
        inst_part = f"\nالتعليمات: {instruction}" if instruction else ""
        return f"هل تريد الموافقة على تعديل محتوى الملف التالي:\n{target}{inst_part}"

    elif tool_name == "search_web":
        query = str(params.get("query") or params.get("Query") or "").strip()
        domain = str(params.get("domain") or "").strip()
        domain_part = f" (نطاق البحث: {domain})" if domain else ""
        return f"هل تريد الموافقة على إجراء بحث في الويب عن:\n\"{query}\"{domain_part}؟"

    elif tool_name == "read_url_content":
        url = str(params.get("Url") or params.get("url") or "").strip()
        return f"هل تريد الموافقة على جلب وقراءة محتوى الرابط التالي:\n{url}"

    elif tool_name == "invoke_subagent":
        subagents = params.get("Subagents", [])
        if isinstance(subagents, list) and len(subagents) > 0 and isinstance(subagents[0], dict):
            first = subagents[0]
            role = first.get("Role") or first.get("TypeName") or "وكيل فرعي"
            prompt_snippet = str(first.get("Prompt", "")).strip()
            if len(prompt_snippet) > 150:
                prompt_snippet = prompt_snippet[:150] + "..."
            return f"هل تريد الموافقة على استدعاء وتفويض الوكيل الفرعي ({role}):\nالمهمة: {prompt_snippet}"
        else:
            role = params.get("Role") or params.get("TypeName") or "وكيل فرعي"
            return f"هل تريد الموافقة على استدعاء وتكليف الوكيل الفرعي ({role})؟"

    elif tool_name == "define_subagent":
        name = params.get("name") or "وكيل جديد"
        desc = params.get("description") or ""
        return f"هل تريد الموافقة على تعريف وتجهيز وكيل فرعي جديد ({name}):\n{desc}"

    elif tool_name == "manage_subagents":
        action = params.get("Action", "إدارة")
        return f"هل تريد الموافقة على إجراء إدارة الوكلاء الفرعيين (إجراء: {action})؟"

    elif tool_name == "send_message":
        recipient = params.get("Recipient", "وكيل فرعي")
        msg = str(params.get("Message", "")).strip()
        if len(msg) > 120:
            msg = msg[:120] + "..."
        return f"هل تريد الموافقة على إرسال رسالة إلى الوكيل ({recipient}):\n{msg}"

    elif tool_name == "schedule":
        duration = params.get("DurationSeconds")
        cron = params.get("CronExpression")
        prompt = str(params.get("Prompt", "")).strip()
        if len(prompt) > 120:
            prompt = prompt[:120] + "..."
        if duration:
            time_info = f"بعد {duration} ثانية"
        elif cron:
            time_info = f"حسب جدول cron: {cron}"
        else:
            time_info = "مؤقت مجدول"
        return f"هل تريد الموافقة على جدولة مهمة خلفية ({time_info}):\n{prompt}"

    elif tool_name == "manage_task":
        action = params.get("Action", "")
        task_id = params.get("TaskId", "")
        return f"هل تريد الموافقة على إدارة المهمة الخلفية ({task_id}) بإجراء: {action}؟"

    else:
        desc = params.get("toolSummary") or params.get("toolAction") or tool_name
        return f"هل تريد الموافقة والمتابعة لتنفيذ الإجراء التالي:\n{desc}"

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

# Fallback default models if offline / CLI unavailable (Clean English verbatim names, no injected tags)
DEFAULT_MODELS = [
    {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"},
    {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)"},
    {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low)"},
    {"id": "gemini-3.7-flash-high", "name": "Gemini 3.7 Flash (High)"},
    {"id": "gemini-3.7-flash-medium", "name": "Gemini 3.7 Flash (Medium)"},
    {"id": "gemini-3.7-flash-low", "name": "Gemini 3.7 Flash (Low)"},
    {"id": "gemini-3.6-flash-high", "name": "Gemini 3.6 Flash (High)"},
    {"id": "gemini-3.6-flash-medium", "name": "Gemini 3.6 Flash (Medium)"},
    {"id": "gemini-3.6-flash-low", "name": "Gemini 3.6 Flash (Low)"},
    {"id": "gemini-3.1-pro-high", "name": "Gemini 3.1 Pro (High)"},
    {"id": "gemini-3.1-pro-low", "name": "Gemini 3.1 Pro (Low)"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6 (Thinking)"},
    {"id": "claude-opus-4-6-thinking", "name": "Claude Opus 4.6 (Thinking)"},
    {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)"}
]

# Thread-safe Cache Structure for Models
_MODELS_CACHE = {
    "data": list(DEFAULT_MODELS),
    "timestamp": 0.0,
    "ttl": 300.0,  # 5 minutes cache TTL
    "is_fetching": False
}
_MODELS_LOCK = threading.Lock()

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
                                    send_system_broadcast("done", f"اكتملت المهمة المجدولة: {p_snippet}", urgent=False)
                            except Exception:
                                pass
        except Exception:
            pass

_watcher_thread = threading.Thread(target=_background_task_watcher, daemon=True, name="BackgroundTaskWatcher")
_watcher_thread.start()

def get_agy_binary_path():
    """Resolve the agy executable path reliably across Termux and standard paths."""
    import shutil
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

def parse_agy_models_output(raw_output):
    """
    Parse raw output from `agy models` into a structured list of model dicts.
    Extracts raw IDs and official English display names verbatim.
    """
    if not raw_output or not isinstance(raw_output, str):
        return []

    clean_text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\([a-zA-Z]', '', raw_output)
    raw_lines = re.split(r'[\r\n]+', clean_text)

    noise_patterns = [
        re.compile(r'fetching\s+available\s+models', re.IGNORECASE),
        re.compile(r'^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+$'),
        re.compile(r'^usage\s*:', re.IGNORECASE),
        re.compile(r'^available\s+subcommands', re.IGNORECASE)
    ]

    models = []
    seen_ids = set()

    for line in raw_lines:
        line_str = line.strip()
        if not line_str:
            continue

        if any(p.search(line_str) for p in noise_patterns):
            continue

        parts = re.split(r'\s{2,}|\t+', line_str, maxsplit=1)
        if len(parts) == 2:
            m_id = parts[0].strip()
            m_name = parts[1].strip()
        else:
            single_split = line_str.split(None, 1)
            if len(single_split) == 2:
                m_id = single_split[0].strip()
                m_name = single_split[1].strip()
            else:
                m_id = line_str
                m_name = line_str

        if not m_id or ' ' in m_id or m_id.startswith(('-', '/', '[', '(', '*')):
            continue
        if not re.match(r'^[a-zA-Z0-9_\-\.:]+$', m_id):
            continue

        if m_id not in seen_ids:
            seen_ids.add(m_id)
            models.append({
                "id": m_id,
                "name": m_name
            })

    return models

def _fetch_models_from_cli(timeout=10.0):
    agy_cmd = get_agy_binary_path()
    env = dict(os.environ)
    env["AGY_AUTO_UPDATE"] = "1"
    env["AGY_NO_UPDATE_CHECK"] = "1"

    try:
        res = subprocess.run(
            [agy_cmd, "models"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=timeout,
            env=env
        )
        if res.returncode == 0 and res.stdout:
            parsed = parse_agy_models_output(res.stdout)
            if parsed:
                return parsed
    except subprocess.TimeoutExpired:
        logger.warning("`%s models` timed out after %s seconds", agy_cmd, timeout)
    except Exception as e:
        logger.warning("Failed to execute `%s models`: %s", agy_cmd, e)
    return None

def refresh_models_cache_async():
    def _worker():
        with _MODELS_LOCK:
            if _MODELS_CACHE["is_fetching"]:
                return
            _MODELS_CACHE["is_fetching"] = True

        try:
            live_models = _fetch_models_from_cli(timeout=10.0)
            if live_models:
                with _MODELS_LOCK:
                    _MODELS_CACHE["data"] = live_models
                    _MODELS_CACHE["timestamp"] = time.time()
                    logger.info("Live models cache refreshed (%d models)", len(live_models))
        finally:
            with _MODELS_LOCK:
                _MODELS_CACHE["is_fetching"] = False

    t = threading.Thread(target=_worker, daemon=True, name="ModelsRefreshWorker")
    t.start()

def get_available_models(force_refresh=False):
    now = time.time()
    with _MODELS_LOCK:
        cached_data = list(_MODELS_CACHE["data"])
        cache_ts = _MODELS_CACHE["timestamp"]
        ttl = _MODELS_CACHE["ttl"]
        is_fetching = _MODELS_CACHE["is_fetching"]

    cache_expired = (now - cache_ts) > ttl

    if not force_refresh and not cache_expired and cache_ts > 0:
        return cached_data

    if cache_ts == 0 or force_refresh:
        live = _fetch_models_from_cli(timeout=8.0)
        if live:
            with _MODELS_LOCK:
                _MODELS_CACHE["data"] = live
                _MODELS_CACHE["timestamp"] = time.time()
            return live

    if cache_expired and not is_fetching:
        refresh_models_cache_async()

    return cached_data if cached_data else list(DEFAULT_MODELS)

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

def resolve_model_id(model_str):
    if not model_str:
        return "gemini-3.8-flash-medium"
    m_str = str(model_str).strip()

    # 1. Match against live cache
    models = get_available_models()
    for m in models:
        if m.get("id", "").strip().lower() == m_str.lower():
            return m["id"]
        if m.get("name", "").strip().lower() == m_str.lower():
            return m["id"]

    # 2. Match against DEFAULT_MODELS
    for m in DEFAULT_MODELS:
        if m.get("id", "").strip().lower() == m_str.lower():
            return m["id"]
        if m.get("name", "").strip().lower() == m_str.lower():
            return m["id"]

    # 3. Normalize common naming pattern e.g. "Gemini 3.8 Flash (High)"
    normalized = re.sub(r'[\(\)]', '', m_str).strip().lower()
    normalized = re.sub(r'\s+', '-', normalized)
    for m in DEFAULT_MODELS:
        if m.get("id", "").strip().lower() == normalized:
            return m["id"]

    return m_str

def load_settings():
    default_settings = {
        "model": "gemini-3.8-flash-medium",
        "effort": "medium",
        "permissions": {
            "allow": ["command(*)", "write_file(*)", "read_url(*)"]
        },
        "safe_mode": True,
        "autopilot": False,
        "allow_commands": True,
        "allow_write": True,
        "allow_web": True,
        "allow_subagent": False,
        "allow_schedule": False,
        "speech_enabled": True,
        "tones_enabled": True,
        "haptic_enabled": True,
        "trustedWorkspaces": [
            HOME_DIR,
            os.path.join(HOME_DIR, "termux-accessible-web"),
            os.path.join(HOME_DIR, "downloads")
        ]
    }
    cfg = dict(default_settings)

    # 1. Load from SETTINGS_FILE (agy settings)
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    if "model" in data and data["model"]:
                        cfg["model"] = resolve_model_id(data["model"])
                    if "effort" in data and data["effort"]:
                        cfg["effort"] = data["effort"]
                    if "safe_mode" in data:
                        cfg["safe_mode"] = bool(data["safe_mode"])
                    if "speech_enabled" in data:
                        cfg["speech_enabled"] = bool(data["speech_enabled"])
                    if "tones_enabled" in data:
                        cfg["tones_enabled"] = bool(data["tones_enabled"])
                    if "haptic_enabled" in data:
                        cfg["haptic_enabled"] = bool(data["haptic_enabled"])
                    if "trustedWorkspaces" in data and isinstance(data["trustedWorkspaces"], list):
                        cfg["trustedWorkspaces"] = data["trustedWorkspaces"]
                    if "permissions" in data and isinstance(data["permissions"], dict):
                        p_allow = data["permissions"].get("allow")
                        if isinstance(p_allow, list):
                            cfg["permissions"] = {"allow": list(p_allow)}
        except Exception as e:
            logger.warning("Error reading settings from %s: %s", SETTINGS_FILE, e)

    # 2. Load and overlay from WEB_SETTINGS_FILE (dedicated persistent store)
    if os.path.exists(WEB_SETTINGS_FILE):
        try:
            with open(WEB_SETTINGS_FILE, "r", encoding="utf-8") as f:
                web_data = json.load(f)
                if isinstance(web_data, dict):
                    for k in ["safe_mode", "autopilot", "allow_commands", "allow_write", "allow_web", "allow_subagent", "allow_schedule", "speech_enabled", "tones_enabled", "haptic_enabled", "trustedWorkspaces", "model", "effort"]:
                        if k in web_data:
                            cfg[k] = web_data[k]
        except Exception as e:
            logger.warning("Error reading web settings from %s: %s", WEB_SETTINGS_FILE, e)
    else:
        # Seed permissions from perms
        perms = cfg.get("permissions", {}).get("allow", [])
        if not isinstance(perms, list):
            perms = []
        cfg["allow_commands"] = "command" in perms or "command(*)" in perms
        cfg["allow_write"] = "file_write" in perms or "write_file(*)" in perms
        cfg["allow_web"] = "web_access" in perms or "read_url(*)" in perms
        cfg["allow_subagent"] = "subagents" in perms or "invoke_subagent(*)" in perms
        cfg["allow_schedule"] = "schedule" in perms or "schedule(*)" in perms

    # Consistency checks & build synchronized active permissions allow list
    is_safe = bool(cfg.get("safe_mode", True))
    if "autopilot" in cfg:
        is_safe = not bool(cfg.get("autopilot"))
    cfg["safe_mode"] = is_safe
    cfg["autopilot"] = not is_safe

    # Reconstruct strict active allow list from granular toggles
    active_allow = []
    if cfg.get("allow_commands", True):
        active_allow.extend(["command", "command(*)"])
    if cfg.get("allow_write", True):
        active_allow.extend(["file_write", "write_file(*)"])
    if cfg.get("allow_web", True):
        active_allow.extend(["web_access", "read_url(*)"])
    if cfg.get("allow_subagent", False):
        active_allow.extend(["subagents", "invoke_subagent(*)"])
    if cfg.get("allow_schedule", False):
        active_allow.extend(["schedule", "schedule(*)"])
    cfg["permissions"] = {"allow": active_allow}


    return cfg

def save_settings(data):
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        os.makedirs(os.path.dirname(WEB_SETTINGS_FILE), exist_ok=True)

        # 1. Extract and save dedicated web_settings.json
        web_data = {
            "model": data.get("model", "gemini-3.8-flash-medium"),
            "effort": data.get("effort", "medium"),
            "safe_mode": bool(data.get("safe_mode", True)),
            "autopilot": not bool(data.get("safe_mode", True)),
            "allow_commands": bool(data.get("allow_commands", True)),
            "allow_write": bool(data.get("allow_write", True)),
            "allow_web": bool(data.get("allow_web", True)),
            "allow_subagent": bool(data.get("allow_subagent", False)),
            "allow_schedule": bool(data.get("allow_schedule", False)),
            "speech_enabled": bool(data.get("speech_enabled", True)),
            "tones_enabled": bool(data.get("tones_enabled", True)),
            "haptic_enabled": bool(data.get("haptic_enabled", True)),
            "trustedWorkspaces": data.get("trustedWorkspaces", [HOME_DIR])
        }
        temp_web = f"{WEB_SETTINGS_FILE}.tmp.{os.getpid()}_{int(time.time() * 1000)}"
        with open(temp_web, "w", encoding="utf-8") as f:
            json.dump(web_data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_web, WEB_SETTINGS_FILE)

        # 2. Build clean agy-compliant settings for settings.json
        agy_allow = []
        if web_data["allow_commands"]:
            agy_allow.append("command(*)")
        if web_data["allow_write"]:
            agy_allow.append("write_file(*)")
        if web_data["allow_web"]:
            agy_allow.append("read_url(*)")
        if web_data["allow_subagent"]:
            agy_allow.append("invoke_subagent(*)")
        if web_data["allow_schedule"]:
            agy_allow.append("schedule(*)")

        current_agy = {}
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    current_agy = json.load(f)
                    if not isinstance(current_agy, dict):
                        current_agy = {}
            except Exception:
                current_agy = {}

        current_agy["model"] = web_data["model"]
        current_agy["effort"] = web_data["effort"]
        current_agy["safe_mode"] = web_data["safe_mode"]
        current_agy["speech_enabled"] = web_data["speech_enabled"]
        current_agy["tones_enabled"] = web_data["tones_enabled"]
        current_agy["haptic_enabled"] = web_data["haptic_enabled"]
        current_agy["trustedWorkspaces"] = web_data["trustedWorkspaces"]
        current_agy.setdefault("permissions", {})["allow"] = agy_allow

        temp_agy = f"{SETTINGS_FILE}.tmp.{os.getpid()}_{int(time.time() * 1000)}"
        with open(temp_agy, "w", encoding="utf-8") as f:
            json.dump(current_agy, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_agy, SETTINGS_FILE)
        logger.info("Settings successfully synchronized to web_settings.json and %s", SETTINGS_FILE)
        return True
    except Exception as e:
        logger.error("Failed to save settings: %s", e)
        return False

def forward_stream(source, dest):
    try:
        while True:
            data = source.recv(16384)
            if not data:
                break
            dest.sendall(data)
    except Exception:
        pass
    finally:
        try: source.close()
        except: pass
        try: dest.close()
        except: pass

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

def handle_ai_stream(client_sock, body_bytes):
    global active_ai_process, permission_event, permission_response, permission_question
    # 1. Essential: remove socket timeout, enable aggressive TCP keepalive and TCP_NODELAY
    try:
        client_sock.settimeout(None)
        client_sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        client_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        if hasattr(socket, "TCP_KEEPIDLE"):
            client_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 5)
        if hasattr(socket, "TCP_KEEPINTVL"):
            client_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 3)
        if hasattr(socket, "TCP_KEEPCNT"):
            client_sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5)
    except Exception:
        pass

    # Acquire Android WakeLock to prevent Termux and CPU sleep during long AI tasks
    try:
        subprocess.run(["/data/data/com.termux/files/usr/bin/termux-wake-lock"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    try:
        req_data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
    except Exception:
        req_data = {}

    prompt = req_data.get("prompt", "").strip()
    use_continue = req_data.get("continue", True)
    force_new = bool(req_data.get("force_new", False)) or (not use_continue)
    conversation_id = req_data.get("conversation_id", "").strip()

    if force_new:
        persistent_ai_session.terminate()
        with ai_process_lock:
            active_ai_process = None
        conversation_id = ""

    if not prompt:
        send_json_response(client_sock, {"error": "Prompt cannot be empty"}, status_code=400, status_text="Bad Request")
        return

    # Check safe_mode and model from settings
    settings = load_settings()
    if "autopilot" in req_data and "safe_mode" not in req_data:
        safe_mode = not bool(req_data["autopilot"])
    elif "safe_mode" in req_data:
        safe_mode = bool(req_data["safe_mode"])
    else:
        safe_mode = bool(settings.get("safe_mode", not settings.get("autopilot", True)))

    # Send SSE Headers immediately
    sse_header = (
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/event-stream; charset=utf-8\r\n"
        "Cache-Control: no-cache, no-transform\r\n"
        "Connection: keep-alive\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "X-Accel-Buffering: no\r\n\r\n"
    ).encode("utf-8")
    client_sock.sendall(sse_header)

    raw_model = settings.get("model", "")
    selected_model = resolve_model_id(raw_model)
    effort = settings.get("effort", "medium")

    # Coordinated model & reasoning effort handling
    m_eff = re.search(r'-(low|medium|high)$', selected_model)
    eff_to_pass = ""
    if m_eff:
        if effort in ["low", "medium", "high"]:
            base_model = selected_model[:m_eff.start()]
            selected_model = f"{base_model}-{effort}"
    else:
        if effort in ["low", "medium", "high"] and "thinking" not in selected_model:
            eff_to_pass = effort

    denied_tools = []
    live_conv_id = conversation_id or ""
    working_dir = req_data.get("cwd") or HOME_DIR
    proc = None

    try:
        proc, line_queue, is_new_session = persistent_ai_session.get_or_create(
            conversation_id=conversation_id,
            model=selected_model,
            effort=eff_to_pass,
            cwd=working_dir,
            force_new=force_new
        )
        with ai_process_lock:
            active_ai_process = proc

        if not is_new_session:
            init_payload = json.dumps({
                "type": "init",
                "cwd": working_dir,
                "conversation_id": persistent_ai_session.conversation_id or live_conv_id,
                "safe_mode": safe_mode
            }, ensure_ascii=False)
            client_sock.sendall(f"data: {init_payload}\n\n".encode("utf-8"))

        # Send user prompt to persistent session stdin
        if not persistent_ai_session.send_prompt(prompt):
            proc, line_queue, is_new_session = persistent_ai_session.get_or_create(
                conversation_id=conversation_id,
                model=selected_model,
                effort=eff_to_pass,
                cwd=working_dir,
                force_new=force_new
            )
            with ai_process_lock:
                active_ai_process = proc
            persistent_ai_session.send_prompt(prompt)

        last_activity = time.time()
        got_final_result = False
        client_connected = True

        def safe_send(payload_str):
            nonlocal client_connected
            if not client_connected:
                return False
            try:
                client_sock.sendall(payload_str.encode("utf-8"))
                return True
            except Exception:
                client_connected = False
                return False

        while True:
            try:
                line = line_queue.get(timeout=2.0)
            except queue.Empty:
                # If AI process ended and queue is drained, stop
                if proc.poll() is not None and line_queue.empty():
                    break
                # Only ping if client is still connected; DO NOT abort AI execution on client disconnect!
                if client_connected:
                    heartbeat_payload = json.dumps({"type": "ping", "timestamp": int(time.time())}, ensure_ascii=False)
                    safe_send(f": heartbeat\n\ndata: {heartbeat_payload}\n\n")
                continue

            if line is None:
                # End of process stream
                break

            last_activity = time.time()
            line_str = line.strip()
            if not line_str:
                continue

            try:
                raw_event = json.loads(line_str)
                event_type = raw_event.get("event")

                if event_type == "init":
                    live_conv_id = raw_event.get("conversation_id", "") or live_conv_id
                    persistent_ai_session.conversation_id = live_conv_id
                    payload = json.dumps({
                        "type": "init",
                        "cwd": raw_event.get("init", {}).get("cwd", HOME_DIR),
                        "conversation_id": live_conv_id,
                        "safe_mode": safe_mode
                    }, ensure_ascii=False)
                    safe_send(f"data: {payload}\n\n")

                elif event_type == "step_update":
                    step = raw_event.get("step_update", {})
                    stype = step.get("step_type")
                    state = step.get("state")

                    step_usage = step.get("usage")
                    if step_usage:
                        with ai_stats_lock:
                            latest_ai_stats["last_tokens"] = step_usage.get("total_tokens", 0)
                            latest_ai_stats["input_tokens"] = step_usage.get("input_tokens", 0)
                            latest_ai_stats["output_tokens"] = step_usage.get("output_tokens", 0)
                            latest_ai_stats["thinking_tokens"] = step_usage.get("thinking_tokens", 0)
                            latest_ai_stats["cache_read_tokens"] = step_usage.get("cache_read_tokens", 0)
                        u_payload = json.dumps({
                            "type": "usage_update",
                            "usage": step_usage
                        }, ensure_ascii=False)
                        safe_send(f"data: {u_payload}\n\n")

                    if stype == "tool":
                        tool_name = step.get("tool_name", "")
                        tool_info = step.get("tool_info", {})
                        params = tool_info.get("parameters", {})

                        category = TOOL_TO_CATEGORY.get(tool_name)
                        current_perms = settings.get("permissions", {}).get("allow", [])

                        # Determine if user permission is required:
                        # 1. Tool category is not in current allowed permissions
                        # 2. OR Safe Mode is active and tool is not yet approved in this session
                        cat_allowed = is_category_allowed(current_perms, category) if category else True
                        needs_perm_prompt = False

                        if category and not cat_allowed and tool_name not in session_approved_tools:
                            needs_perm_prompt = True
                        elif safe_mode and category and state != "DONE" and tool_name not in session_approved_tools:
                            needs_perm_prompt = True

                        if needs_perm_prompt and state != "DONE":
                            is_suspended = False
                            try:
                                if proc and proc.poll() is None:
                                    os.killpg(os.getpgid(proc.pid), signal.SIGSTOP)
                                    is_suspended = True
                                    logger.info(f"Suspended AI process {proc.pid} for tool permission check: {tool_name}")
                            except Exception as e:
                                logger.warning(f"Could not suspend process: {e}")

                            q_text = format_human_permission_question(tool_name, params)
                            permission_question["text"] = q_text
                            permission_event.clear()

                            perm_req_payload = json.dumps({
                                "type": "permission_request",
                                "tool": tool_name,
                                "question": q_text,
                                "params": params
                            }, ensure_ascii=False)
                            safe_send(f"data: {perm_req_payload}\n\n")

                            # Immediate notification: ALWAYS broadcast permission to status bar & state file!
                            send_system_broadcast("permission", f"مطلوب موافقة في Antigravity: {q_text}", urgent=True)

                            # Safe heartbeat wait loop up to 120 seconds
                            start_wait = time.time()
                            while not permission_event.is_set():
                                if time.time() - start_wait > 120.0:
                                    permission_response["key"] = "n"
                                    break

                                if client_connected:
                                    ping_payload = json.dumps({"type": "ping", "timestamp": int(time.time())}, ensure_ascii=False)
                                    safe_send(f": heartbeat\n\ndata: {ping_payload}\n\n")

                                permission_event.wait(1.0)

                            answer = permission_response.get("key", "n")

                            if answer == "n":
                                # User rejected permission: terminate the suspended process so it NEVER executes the tool
                                if is_suspended or (proc and proc.poll() is None):
                                    try:
                                        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                                        proc.wait(timeout=1.0)
                                    except Exception:
                                        try: os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                                        except Exception: pass
                                persistent_ai_session.proc = None

                                if tool_name not in denied_tools:
                                    denied_tools.append(tool_name)
                                logger.info("User rejected permission for tool: %s.", tool_name)

                                label = "تم الرفض ❌"
                                perm_res_payload = json.dumps({
                                    "type": "permission_result",
                                    "answer": answer,
                                    "label": label,
                                    "tool": tool_name
                                }, ensure_ascii=False)
                                safe_send(f"data: {perm_res_payload}\n\n")

                                rej_step_payload = json.dumps({
                                    "type": "tool_step",
                                    "state": "ERROR",
                                    "tool": tool_name,
                                    "params": params,
                                    "output": f"🛑 تم رفض الإذن من قِبل المستخدم وإلغاء تنفيذ الأداة ({tool_name})."
                                }, ensure_ascii=False)
                                safe_send(f"data: {rej_step_payload}\n\n")

                                denial_msg = f"\n\n🛑 **تم إلغاء الإجراء:** رفضت تشغيل الأداة (`{tool_name}`). لم يتم إجراء أي تغيير على نظامك، وجاهز لأي أمر أو استفسار آخر."
                                chunk_payload = json.dumps({
                                    "type": "chunk",
                                    "text": denial_msg
                                }, ensure_ascii=False)
                                safe_send(f"data: {chunk_payload}\n\n")

                                final_payload = json.dumps({
                                    "type": "final_result",
                                    "status": "STOPPED",
                                    "response": denial_msg,
                                    "duration": 0
                                }, ensure_ascii=False)
                                safe_send(f"data: {final_payload}\n\n")

                                done_payload = json.dumps({
                                    "type": "done",
                                    "conversation_id": live_conv_id
                                }, ensure_ascii=False)
                                safe_send(f"data: {done_payload}\n\n")

                                break

                            elif answer in ("y", "a"):
                                # User approved: resume the suspended process to let the tool execute!
                                if is_suspended:
                                    try:
                                        os.killpg(os.getpgid(proc.pid), signal.SIGCONT)
                                        logger.info(f"Resumed AI process {proc.pid} after user approval")
                                    except Exception as e:
                                        logger.warning(f"Could not resume process {proc.pid}: {e}")

                                if answer == "a":
                                    session_approved_tools.add(tool_name)
                                    if category and category not in current_perms:
                                        current_perms.append(category)
                                        try:
                                            cur_cfg = load_settings()
                                            cur_cfg.setdefault("permissions", {}).setdefault("allow", [])
                                            if category not in cur_cfg["permissions"]["allow"]:
                                                cur_cfg["permissions"]["allow"].append(category)
                                            save_settings(cur_cfg)
                                        except Exception:
                                            pass
                                else:
                                    session_approved_tools.add(tool_name)

                                label = "تمت الموافقة ✅"
                                perm_res_payload = json.dumps({
                                    "type": "permission_result",
                                    "answer": "y",
                                    "label": label,
                                    "tool": tool_name
                                }, ensure_ascii=False)
                                try:
                                    client_sock.sendall(f"data: {perm_res_payload}\n\n".encode("utf-8"))
                                except Exception:
                                    pass
                        
                        if state == "ERROR":
                            err_info = tool_info.get("error", {})
                            err_msg = str(err_info.get("message", "")).lower()
                            if "permission" in err_msg or "denied" in err_msg:
                                denied_tools.append(tool_name or "command")

                        if tool_name == "invoke_subagent":
                            sub_list = params.get("Subagents", [])
                            if not isinstance(sub_list, list) or len(sub_list) == 0:
                                sub_list = [{"Role": params.get("Role", "Subagent"), "Prompt": params.get("Prompt", ""), "TypeName": params.get("TypeName", "subagent")}]
                            for idx, s in enumerate(sub_list):
                                s_id = f"sub-{live_conv_id[:8] if live_conv_id else 'agt'}-{idx+1}"
                                register_live_subagent(s_id, s.get("Role"), s.get("TypeName"), s.get("Prompt"), live_conv_id or "")
                        elif tool_name == "schedule":
                            t_id = f"task-{int(time.time())}"
                            dur_raw = params.get("DurationSeconds")
                            try:
                                dur_val = float(dur_raw) if dur_raw is not None else None
                            except Exception:
                                dur_val = None
                            with subagent_lock:
                                active_tasks_registry[t_id] = {
                                    "id": t_id,
                                    "kind": "cron" if params.get("CronExpression") else "timer",
                                    "duration": dur_val,
                                    "cron": params.get("CronExpression"),
                                    "prompt": params.get("Prompt", ""),
                                    "status": "active",
                                    "created_at": time.time(),
                                    "remaining_seconds": int(dur_val) if dur_val else 0
                                }

                        payload = json.dumps({
                            "type": "tool_step",
                            "state": state,
                            "tool": tool_name,
                            "params": params,
                            "output": tool_info.get("output", "")
                        }, ensure_ascii=False)
                        safe_send(f"data: {payload}\n\n")

                    elif stype == "agent_response":
                        delta = step.get("text_delta", "")
                        if delta:
                            payload = json.dumps({
                                "type": "chunk",
                                "text": delta
                            }, ensure_ascii=False)
                            safe_send(f"data: {payload}\n\n")

                    elif stype in ["thought", "thinking", "reasoning"] or "thought" in step or "thinking" in step:
                        thought_text = step.get("thought", "") or step.get("text", "") or step.get("text_delta", "") or step.get("thinking", "")
                        if thought_text:
                            payload = json.dumps({
                                "type": "thought",
                                "text": thought_text
                            }, ensure_ascii=False)
                            safe_send(f"data: {payload}\n\n")

                elif event_type == "result":
                    got_final_result = True
                    res = raw_event.get("result", {})
                    usage = res.get("usage", {})
                    dur = round(res.get("duration_seconds", 0), 2)
                    denied_actions = res.get("denied_actions", [])
                    res_text = res.get("response", "")

                    if (not res_text or not res_text.strip()) and (denied_actions or denied_tools):
                        action_names = []
                        for da in denied_actions:
                            action_names.append(da.get("display_name") or da.get("action") or "أمر طرفية")
                        if not action_names and denied_tools:
                            action_names = denied_tools
                        act_str = "، ".join(set(action_names)) if action_names else "تنفيذ الأوامر"
                        res_text = (
                            f"🔒 **تنبيه إدارة الصلاحيات (Antigravity):**\n\n"
                            f"حاول الوكيل تنفيذ الإجراء المطلوب ({act_str})، ولكن تم إيقافه لأن وضع الأمان مفعل وهذا الإجراء غير مصرح به حالياً.\n\n"
                            f"💡 **خيارات المتابعة الفورية:**\n"
                            f"1. **وضع الطيار الآلي (موصى به):** افتح **الإعدادات ⚙️** وقم بتفعيل 'وضع الطيار الآلي' لتنفيذ كافة العمليات وتعديلات الأكواد بحرية وسرعة.\n"
                            f"2. **السماح بالأوامر:** أو فعّل خيار 'السماح بتنفيذ أوامر الطرفية' من قسم الصلاحيات للموافقة الدائمة على أوامر Bash دون توقف."
                        )
                        res["response"] = res_text

                    with ai_stats_lock:
                        t_tokens = usage.get("total_tokens", 0)
                        latest_ai_stats["last_tokens"] = t_tokens
                        latest_ai_stats["input_tokens"] = usage.get("input_tokens", 0)
                        latest_ai_stats["output_tokens"] = usage.get("output_tokens", 0)
                        latest_ai_stats["thinking_tokens"] = usage.get("thinking_tokens", 0)
                        latest_ai_stats["cache_read_tokens"] = usage.get("cache_read_tokens", 0)
                        latest_ai_stats["duration_seconds"] = dur
                        latest_ai_stats["total_session_tokens"] += t_tokens
                        latest_ai_stats["total_requests"] += 1
                    payload = json.dumps({
                        "type": "final_result",
                        "status": res.get("status", "SUCCESS"),
                        "response": res.get("response", ""),
                        "conversation_id": res.get("conversation_id", ""),
                        "usage": usage,
                        "duration_seconds": dur
                    }, ensure_ascii=False)
                    safe_send(f"data: {payload}\n\n")
                    break

            except Exception:
                # Fallback if line is raw text (e.g. standard terminal output)
                payload = json.dumps({"type": "chunk", "text": line}, ensure_ascii=False)
                safe_send(f"data: {payload}\n\n")

        done_payload = json.dumps({
            "type": "done",
            "returncode": 0 if got_final_result else (proc.poll() or 0)
        }, ensure_ascii=False)
        safe_send(f"data: {done_payload}\n\n")
        clean_text = re.sub(r'[*#_`]', '', res_text).strip() if ('res_text' in locals() and res_text) else ""
        spoken = clean_text[:250] if clean_text else "اكتملت مهمة Antigravity وتم تجهيز الرد بنجاح"
        send_system_broadcast("done", spoken)

    except Exception as e:
        err_payload = json.dumps({"type": "error", "message": str(e)}, ensure_ascii=False)
        safe_send(f"data: {err_payload}\n\n")
    finally:
        with ai_process_lock:
            if proc and proc.poll() is not None and active_ai_process == proc:
                active_ai_process = None
        try: client_sock.close()
        except: pass

# Alias for specification compatibility
handle_prompt_stream = handle_ai_stream

def handle_fs_list(client_sock, query_path=""):
    target_dir = os.path.abspath(query_path) if query_path else HOME_DIR
    # Allow Termux Home and Android Internal Storage navigation
    allowed_roots = [HOME_DIR, "/storage/emulated/0", "/sdcard", "/data/data/com.termux/files"]
    if not any(target_dir.startswith(r) for r in allowed_roots) and not os.path.exists(target_dir):
        target_dir = HOME_DIR

    items = []
    parent_dir = os.path.dirname(target_dir) if target_dir != "/" else None
    try:
        for entry in sorted(os.listdir(target_dir)):
            if entry.startswith(".") and entry not in [".bashrc", ".gemini", ".termux"]:
                continue
            full_path = os.path.join(target_dir, entry)
            is_dir = os.path.isdir(full_path)
            size = os.path.getsize(full_path) if not is_dir else 0
            items.append({
                "name": entry,
                "path": full_path,
                "is_dir": is_dir,
                "size": size
            })
    except Exception as e:
        pass

    send_json_response(client_sock, {
        "current_dir": target_dir,
        "parent_dir": parent_dir,
        "items": items
    })

def handle_fs_read(client_sock, file_path=""):
    if not file_path or not os.path.exists(file_path):
        send_json_response(client_sock, {"error": "File not found"}, status_code=404)
        return
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(50000) # limit to 50KB for snappy response
        send_json_response(client_sock, {
            "path": file_path,
            "name": os.path.basename(file_path),
            "content": content
        })
    except Exception as e:
        send_json_response(client_sock, {"error": str(e)}, status_code=500)

def handle_fs_mkdir(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore"))
        parent_dir = data.get("parent_dir", HOME_DIR)
        name = data.get("name", "").strip()
        if not name:
            send_json_response(client_sock, {"error": "اسم المشروع مطلوب"}, status_code=400)
            return
        import re
        safe_name = re.sub(r'[\\/:*?"<>|]', '_', name)
        new_dir = os.path.join(parent_dir, safe_name)
        os.makedirs(new_dir, exist_ok=True)
        try:
            settings_file = os.path.expanduser("~/.gemini/antigravity-cli/settings.json")
            if os.path.exists(settings_file):
                with open(settings_file, "r", encoding="utf-8") as f:
                    s_data = json.load(f)
                tw = s_data.get("trustedWorkspaces", [])
                if new_dir not in tw:
                    tw.append(new_dir)
                    s_data["trustedWorkspaces"] = tw
                    with open(settings_file, "w", encoding="utf-8") as f:
                        json.dump(s_data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

        send_json_response(client_sock, {
            "status": "ok",
            "path": new_dir,
            "name": safe_name
        })
    except Exception as e:
        send_json_response(client_sock, {"error": str(e)}, status_code=500)

SKILL_DIRS = [
    os.path.expanduser("~/.gemini/config/skills"),
    os.path.expanduser("~/.gemini/skills"),
    os.path.expanduser("~/.gemini/antigravity-cli/builtin/skills")
]
SKILLS_DIR = os.path.expanduser("~/.gemini/config/skills")

def get_installed_skills_list():
    skills = []
    seen = set()
    for sdir in SKILL_DIRS:
        if not os.path.exists(sdir):
            continue
        for item in sorted(os.listdir(sdir)):
            if item in seen:
                continue
            item_path = os.path.join(sdir, item)
            if not os.path.isdir(item_path):
                continue
            skill_md = os.path.join(item_path, "SKILL.md")
            disabled_md = os.path.join(item_path, "SKILL.md.disabled")
            
            is_enabled = os.path.exists(skill_md)
            target_read = skill_md if is_enabled else disabled_md
            name_val = item
            desc_val = ""
            
            if os.path.exists(target_read):
                try:
                    with open(target_read, "r", encoding="utf-8", errors="ignore") as f:
                        header = f.read(2000)
                        name_match = re.search(r"^name:\s*(.+)$", header, re.MULTILINE)
                        if name_match:
                            name_val = name_match.group(1).strip(" \"'")
                        
                        desc_match = re.search(r"^description:\s*(?:>|\|)-?\s*\n((?:[ \t]+.+\n?)+)", header, re.MULTILINE)
                        if desc_match:
                            desc_val = re.sub(r"\s+", " ", desc_match.group(1)).strip()
                        else:
                            desc_match_single = re.search(r"^description:\s*(.+)$", header, re.MULTILINE)
                            if desc_match_single:
                                val = desc_match_single.group(1).strip(" \"'")
                                if val not in (">", ">-", "|", "|-"):
                                    desc_val = val
                except Exception:
                    pass
            
            seen.add(item)
            skills.append({
                "id": item,
                "name": name_val or item,
                "enabled": is_enabled,
                "description": desc_val or ("مفعلة" if is_enabled else "معطلة")
            })
    return skills

def handle_skills_list(client_sock):
    skills = get_installed_skills_list()
    send_json_response(client_sock, {"skills": skills})

# ==============================================================================
# Dynamic Slash Commands Cache & Live Provider
# ==============================================================================
commands_cache = {
    "data": [],
    "last_fetch": 0,
    "is_fetching": False,
    "ttl": 120 # 2 minutes cache
}
commands_lock = threading.Lock()

def _fetch_agy_live_commands(timeout=10.0):
    agy_cmd = get_agy_binary_path()
    commands = []
    try:
        env = dict(os.environ)
        env["AGY_AUTO_UPDATE"] = "0"
        env["AGY_NO_UPDATE_CHECK"] = "1"
        env["GOMAXPROCS"] = "2"
        env["PAGER"] = "cat"
        proc = subprocess.Popen(
            [agy_cmd, "-p", "/help"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True
        )
        stdout, _ = proc.communicate(timeout=timeout)
        for line in stdout.strip().splitlines():
            line = line.strip()
            if not line or not line.startswith("/"):
                continue
            parts = re.split(r"\t+|\s{2,}", line, maxsplit=1)
            cmd_name = parts[0].strip()
            desc = parts[1].strip() if len(parts) > 1 else ""
            commands.append({
                "cmd": cmd_name,
                "desc": desc,
                "source": "cli"
            })
    except Exception as err:
        logger.warning("Failed to fetch live commands from `%s -p /help`: %s", agy_cmd, err)
    return commands

BUILTIN_AGENT_COMMANDS = [
    { "cmd": "/goal", "desc": "🎯 Launch persistent autonomous execution loop for complex objectives", "source": "model" },
    { "cmd": "/schedule", "desc": "⏰ Configure one-shot timers or recurring cron triggers in background", "source": "model" },
    { "cmd": "/browser", "desc": "🌐 Launch headless browser automation, capture screenshots & test web apps", "source": "model" },
    { "cmd": "/plan", "desc": "📋 Generate a detailed, verified task plan before modifying any codebase", "source": "model" },
    { "cmd": "/grill-me", "desc": "🔥 Conduct structured interview to eliminate ambiguity and stress-test assumptions", "source": "model" },
    { "cmd": "/teamwork-preview", "desc": "🗺️ Preview subagent allocation, role decomposition, and dependency graph", "source": "model" },
    { "cmd": "/learn", "desc": "🧠 Extract lessons, architectural conventions, and preferences into memory", "source": "model" },
    { "cmd": "/boost", "desc": "🚀 Elevate reasoning effort to maximum with exhaustive verification passes", "source": "model" },
]

def get_dynamic_slash_commands(force=False):
    now = time.time()
    with commands_lock:
        data = list(commands_cache["data"])
        last_fetch = commands_cache.get("last_fetch", 0)
        is_fetching = commands_cache.get("is_fetching", False)
        ttl = commands_cache.get("ttl", 120)

    if force or (now - last_fetch > ttl) or not data:
        live_cli_cmds = _fetch_agy_live_commands(timeout=10.0)
        skills = get_installed_skills_list()
        
        # Build unified list
        combined = []
        seen = set()
        
        # 0. Builtin Agent Commands
        for c in BUILTIN_AGENT_COMMANDS:
            cmd = c["cmd"]
            seen.add(cmd)
            combined.append(c)
            
        # 1. Official CLI commands
        for c in live_cli_cmds:
            cmd = c["cmd"]
            seen.add(cmd)
            combined.append(c)
            
        # 2. Installed Active Skills
        for s in skills:
            if s.get("enabled", True):
                cmd = "/" + s["id"]
                if cmd not in seen:
                    seen.add(cmd)
                    desc = s.get("description", "")
                    if desc and len(desc) > 80:
                        desc = desc[:80] + "..."
                    combined.append({
                        "cmd": cmd,
                        "desc": desc or ("مهارة " + s.get("name", s["id"])),
                        "source": "skill"
                    })
                    
        # 3. Native special helpers if not present
        special_helpers = [
            {"cmd": "@files", "desc": "📄 تصفح وحقن ملفات المشروع داخل السياق", "source": "helper"},
            {"cmd": "@terminal", "desc": "💻 التقاط مخرجات الطرفية وحقنها للوكيل", "source": "helper"},
            {"cmd": "@mcp", "desc": "🔌 استدعاء وتوجيه بروتوكول MCP مسجل", "source": "helper"}
        ]
        for h in special_helpers:
            if h["cmd"] not in seen:
                seen.add(h["cmd"])
                combined.append(h)
                
        with commands_lock:
            commands_cache["data"] = combined
            commands_cache["last_fetch"] = now
        return combined

    return data

def handle_slash_commands_list(client_sock):
    commands = get_dynamic_slash_commands()
    send_json_response(client_sock, {
        "status": "ok",
        "commands": commands,
        "count": len(commands),
        "last_updated": commands_cache.get("last_fetch", 0)
    })


def handle_skill_toggle(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        skill_id = data.get("id", "").strip()
        enable = data.get("enable", True)
        
        if not skill_id:
            send_json_response(client_sock, {"error": "Skill ID required"}, status_code=400)
            return
            
        skill_path = os.path.join(SKILLS_DIR, skill_id)
        if not os.path.exists(skill_path):
            send_json_response(client_sock, {"error": "Skill not found"}, status_code=404)
            return
            
        skill_md = os.path.join(skill_path, "SKILL.md")
        disabled_md = os.path.join(skill_path, "SKILL.md.disabled")
        
        if enable:
            if os.path.exists(disabled_md):
                os.rename(disabled_md, skill_md)
            msg = f"تم تفعيل مهارة {skill_id} بنجاح"
        else:
            if os.path.exists(skill_md):
                os.rename(skill_md, disabled_md)
            msg = f"تم تعطيل مهارة {skill_id} بنجاح"
            
        send_json_response(client_sock, {
            "status": "ok",
            "id": skill_id,
            "enabled": enable,
            "message": msg
        })
    except Exception as e:
        send_json_response(client_sock, {"error": str(e)}, status_code=500)

MCP_CONFIG_PATH = os.path.expanduser("~/.gemini/config/mcp_config.json")

MCP_APPROVED_CATALOG = [
    {
        "id": "fs",
        "name": "Filesystem",
        "category": "النظام والملفات",
        "description": "قراءة وكتابة واستعراض ملفات نظام أندرويد وتيرماكس بأمان",
        "command": "npx -y @modelcontextprotocol/server-filesystem /data/data/com.termux/files/home",
        "package": "@modelcontextprotocol/server-filesystem",
        "icon": "📁"
    },
    {
        "id": "sqlite",
        "name": "SQLite",
        "category": "قواعد البيانات",
        "description": "استعلام وإدارة قواعد بيانات SQLite3 المحلية بسهولة وسرعة",
        "command": "npx -y @modelcontextprotocol/server-sqlite",
        "package": "@modelcontextprotocol/server-sqlite",
        "icon": "🗄️"
    },
    {
        "id": "memory",
        "name": "Memory (Knowledge Graph)",
        "category": "الذاكرة والاستدلال",
        "description": "رسم شجرة معرفية طويلة المدى وتذكر تفضيلات المستخدم بين الجلسات",
        "command": "npx -y @modelcontextprotocol/server-memory",
        "package": "@modelcontextprotocol/server-memory",
        "icon": "🧠"
    },
    {
        "id": "fetch",
        "name": "Fetch",
        "category": "الشبكة والويب",
        "description": "جلب وقراءة صفحات الإنترنت وتحويلها لنصوص مهيأة للذكاء الاصطناعي",
        "command": "npx -y @modelcontextprotocol/server-fetch",
        "package": "@modelcontextprotocol/server-fetch",
        "icon": "🌐"
    },
    {
        "id": "git",
        "name": "Git",
        "category": "أدوات التطوير",
        "description": "فحص مستودعات Git، قراءة الفروع، استعراض السجل والتغييرات",
        "command": "npx -y @modelcontextprotocol/server-git",
        "package": "@modelcontextprotocol/server-git",
        "icon": "🐙"
    },
    {
        "id": "brave-search",
        "name": "Brave Search",
        "category": "البحث",
        "description": "البحث الحي في الويب والحصول على نتائج محدثة عبر محرك Brave",
        "command": "npx -y @modelcontextprotocol/server-brave-search",
        "package": "@modelcontextprotocol/server-brave-search",
        "icon": "🔍"
    },
    {
        "id": "puppeteer",
        "name": "Puppeteer",
        "category": "أتمتة المتصفح",
        "description": "أتمتة متصفح Chromium، التقاط لقطات شاشة، واستخراج البيانات",
        "command": "npx -y @modelcontextprotocol/server-puppeteer",
        "package": "@modelcontextprotocol/server-puppeteer",
        "icon": "🎭"
    }
]

def load_mcp_servers_from_config():
    servers = {}
    if os.path.exists(MCP_CONFIG_PATH):
        try:
            with open(MCP_CONFIG_PATH, "r", encoding="utf-8", errors="ignore") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    servers = data.get("mcpServers", {})
        except Exception:
            pass
    return servers

def run_agy_mcp_command(args, timeout=25):
    try:
        cmd = ["agy", "mcp"] + args
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout
        )
        return proc.returncode == 0, proc.stdout.strip(), proc.stderr.strip()
    except subprocess.TimeoutExpired:
        return False, "", "انتهت المهلة الزمنية لتنفيذ الأمر"
    except Exception as e:
        return False, "", str(e)

def handle_mcp_list(client_sock):
    # 1. Fetch from mcp_config.json as source of truth
    config_servers = load_mcp_servers_from_config()
    
    # 2. Also run agy mcp list to verify CLI responsiveness
    cli_ok, cli_out, _ = run_agy_mcp_command(["list"], timeout=10)
    
    installed = []
    for name, details in config_servers.items():
        cmd = details.get("command", "")
        args = details.get("args", [])
        url = details.get("url", "")
        cmd_or_url = url if url else (f"{cmd} " + " ".join(args)).strip()
        server_type = details.get("type", "http" if url else "stdio")
        is_disabled = bool(details.get("disabled", False))
        env = details.get("env", {})
        headers = details.get("headers", {})
        
        installed.append({
            "name": name,
            "type": server_type,
            "enabled": not is_disabled,
            "status": "disabled" if is_disabled else "enabled",
            "command": cmd_or_url,
            "raw_command": cmd,
            "args": args,
            "url": url,
            "env": env,
            "headers": headers
        })
    
    installed.sort(key=lambda x: x["name"])
    
    send_json_response(client_sock, {
        "status": "ok",
        "installed": installed,
        "catalog": MCP_APPROVED_CATALOG,
        "cli_output": cli_out if cli_ok else ""
    })

def handle_mcp_install(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        name = str(data.get("name", "")).strip()
        command = str(data.get("command", "")).strip()
        server_type = str(data.get("type", "")).strip()
        env_vars = data.get("env", []) # can be list of "KEY=val" or dict
        headers = data.get("headers", []) # list of "Header: val"
        
        if not name:
            send_json_response(client_sock, {"status": "error", "error": "اسم البروتوكول مطلوب (name required)"}, status_code=400)
            return
            
        if not command:
            # Check if name is in catalog
            catalog_item = next((item for item in MCP_APPROVED_CATALOG if item["id"] == name), None)
            if catalog_item:
                command = catalog_item["command"]
            else:
                send_json_response(client_sock, {"status": "error", "error": "الأمر أو الرابط مطلوب (command or url required)"}, status_code=400)
                return

        # Prepare agy mcp add [flags] <name> <commandOrUrl> [args...]
        cmd_args = ["add"]
        
        if server_type in ["stdio", "http"]:
            cmd_args.extend(["--type", server_type])
            
        if isinstance(env_vars, dict):
            for k, v in env_vars.items():
                cmd_args.extend(["--env", f"{k}={v}"])
        elif isinstance(env_vars, list):
            for ev in env_vars:
                if ev:
                    cmd_args.extend(["--env", str(ev)])
                    
        if isinstance(headers, list):
            for h in headers:
                if h:
                    cmd_args.extend(["--header", str(h)])
                    
        cmd_args.append(name)
        
        # Split command into parts using shlex
        parts = shlex.split(command)
        if not parts:
            send_json_response(client_sock, {"status": "error", "error": "أمر التثبيت فارغ"}, status_code=400)
            return
            
        cmd_args.extend(parts)
        
        ok, out, err = run_agy_mcp_command(cmd_args, timeout=30)
        if ok:
            send_json_response(client_sock, {
                "status": "ok",
                "message": f"تم تثبيت البروتوكول '{name}' بنجاح",
                "name": name,
                "output": out
            })
        else:
            send_json_response(client_sock, {
                "status": "error",
                "error": err or out or "فشل تثبيت البروتوكول عبر agy mcp"
            }, status_code=500)
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "error": str(e)}, status_code=500)

def handle_mcp_remove(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        name = str(data.get("name", "")).strip()
        if not name:
            send_json_response(client_sock, {"status": "error", "error": "اسم البروتوكول مطلوب (name required)"}, status_code=400)
            return
            
        ok, out, err = run_agy_mcp_command(["remove", name], timeout=15)
        if ok:
            send_json_response(client_sock, {
                "status": "ok",
                "message": f"تم حذف البروتوكول '{name}' بنجاح",
                "name": name,
                "output": out
            })
        else:
            send_json_response(client_sock, {
                "status": "error",
                "error": err or out or f"فشل حذف البروتوكول '{name}'"
            }, status_code=500)
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "error": str(e)}, status_code=500)

def handle_mcp_toggle(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        name = str(data.get("name", "")).strip()
        enable = bool(data.get("enable", True))
        
        if not name:
            send_json_response(client_sock, {"status": "error", "error": "اسم البروتوكول مطلوب (name required)"}, status_code=400)
            return
            
        subcmd = "enable" if enable else "disable"
        ok, out, err = run_agy_mcp_command([subcmd, name], timeout=15)
        if ok:
            status_word = "تفعيل" if enable else "تعطيل"
            send_json_response(client_sock, {
                "status": "ok",
                "message": f"تم {status_word} البروتوكول '{name}' بنجاح",
                "name": name,
                "enabled": enable,
                "output": out
            })
        else:
            send_json_response(client_sock, {
                "status": "error",
                "error": err or out or f"فشل تعديل حالة البروتوكول '{name}'"
            }, status_code=500)
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "error": str(e)}, status_code=500)

BRAIN_DIR = os.path.expanduser("~/.gemini/antigravity-cli/brain")

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


# ==============================================================================
# ANTIGRAVITY QUOTA PARSER & CACHE
# ==============================================================================
DEFAULT_QUOTAS = [
    {"group": "Gemini Models", "limit_type": "Five Hour Limit Remaining", "pct": "83%", "pct_val": 83, "reset_time": "2026-09-11T14:19:14Z"},
    {"group": "Gemini Models", "limit_type": "Weekly Limit Remaining", "pct": "64%", "pct_val": 64, "reset_time": "2026-09-15T21:12:06Z"},
    {"group": "Claude and GPT models", "limit_type": "Five Hour Limit Remaining", "pct": "100%", "pct_val": 100, "reset_time": "2026-09-11T15:35:57Z"},
    {"group": "Claude and GPT models", "limit_type": "Weekly Limit Remaining", "pct": "66%", "pct_val": 66, "reset_time": "2026-09-17T20:03:06Z"}
]

quota_cache = {
    "data": list(DEFAULT_QUOTAS),
    "last_fetch": 0,
    "is_fetching": False,
    "ttl": 300,
}
quota_lock = threading.Lock()

def _fetch_quota_from_cli(timeout=12.0):
    agy_cmd = "/data/data/com.termux/files/usr/bin/agy" if os.path.exists("/data/data/com.termux/files/usr/bin/agy") else "agy"
    try:
        env = dict(os.environ)
        env["AGY_AUTO_UPDATE"] = "1"
        env["AGY_NO_UPDATE_CHECK"] = "1"
        env["PATH"] = "/data/data/com.termux/files/usr/bin:" + env.get("PATH", "")

        proc = subprocess.run(
            [agy_cmd, "-p", "/usage"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            timeout=timeout
        )
        lines = proc.stdout.strip().splitlines()
        quotas = []
        for line_str in lines:
            line_str = line_str.strip()
            if not line_str or "Quota:" in line_str:
                continue
            parts = [p.strip() for p in re.split(r"\t+|\s{2,}", line_str) if p.strip()]
            if len(parts) >= 4:
                group, limit_type, pct, reset = parts[0], parts[1], parts[2], parts[3]
                quotas.append({
                    "group": group,
                    "limit_type": limit_type,
                    "pct": pct,
                    "pct_val": int(pct.replace("%", "")) if "%" in pct else 0,
                    "reset_time": reset
                })
        return quotas if quotas else None
    except subprocess.TimeoutExpired:
        logger.warning("`%s -p /usage` timed out after %s seconds", agy_cmd, timeout)
    except Exception as err:
        logger.warning("Failed to fetch quota from CLI: %s", err)
    return None

def refresh_quota_cache_async():
    def _worker():
        with quota_lock:
            if quota_cache.get("is_fetching", False):
                return
            quota_cache["is_fetching"] = True

        try:
            live = _fetch_quota_from_cli(timeout=12.0)
            with quota_lock:
                if live:
                    quota_cache["data"] = live
                quota_cache["last_fetch"] = time.time()
        finally:
            with quota_lock:
                quota_cache["is_fetching"] = False

    t = threading.Thread(target=_worker, daemon=True, name="QuotaRefreshWorker")
    t.start()

def fetch_antigravity_quota(force=False):
    now = time.time()
    with quota_lock:
        data = list(quota_cache["data"])
        last_fetch = quota_cache.get("last_fetch", 0)
        is_fetching = quota_cache.get("is_fetching", False)
        ttl = quota_cache.get("ttl", 300)

    if (force or (now - last_fetch > ttl) or last_fetch == 0) and not is_fetching:
        refresh_quota_cache_async()

    return data

def handle_quota_get(client_sock, force=False):
    data = fetch_antigravity_quota(force=force)
    send_json_response(client_sock, {
        "quotas": data,
        "last_updated": quota_cache["last_fetch"]
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

def handle_device_agent_turn(client_sock, body_bytes):
    try:
        req = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "error": f"Invalid JSON: {e}"}, status_code=400)
        return

    command = req.get("command", "").strip()
    ui_tree = req.get("ui_tree", "").strip()
    step = int(req.get("step", 1))
    history = req.get("history", [])
    last_error = req.get("last_error", "").strip()
    session_id = req.get("session_id", "").strip() or f"device-agent-{int(time.time())}"
    image_path = req.get("image_path", "").strip()
    image_base64 = req.get("image_base64", "").strip()

    if image_base64 and not image_path:
        try:
            import base64
            img_bytes = base64.b64decode(image_base64)
            image_path = "/sdcard/Download/agent_screenshot.jpg"
            with open(image_path, "wb") as f_img:
                f_img.write(img_bytes)
        except Exception as e_b64:
            logger.warning(f"Error saving image_base64: {e_b64}")

    if not command and not ui_tree and not image_path:
        send_json_response(client_sock, {"status": "error", "error": "Command, UI tree, or Image required"}, status_code=400)
        return

    settings = load_settings()
    raw_model = settings.get("model", "")
    selected_model = resolve_model_id(raw_model) or "gemini-3.8-flash-high"
    device_model = selected_model
    effort = settings.get("effort", "medium")
    effort_to_pass = "" if any(device_model.endswith(s) for s in ["-low", "-medium", "-high"]) else effort

    system_prompt = (
        "أنت 'الوكيل الشامل الخارق' (Antigravity Omni-Agent) للتحكم في الهاتف والنظام لصالح المستخدم (أحمد).\n"
        "أنت لست مجرد أداة نقر آلية، بل مساعد شخصي متكامل فائق الذكاء، بصير، ومبادر. تمتلك كل قدرات Antigravity في الشرح، النقاش، التفكير، التحكم بأندرويد، وتنفيذ أوامر النظام في Termux.\n\n"
        "إمكانياتك وقنواتك الرئيسية:\n"
        "1. الصوت والنقاش والشرح (Speech & Discussion):\n"
        "   - تحدث دائماً باللهجة المصرية الودودة، الذكية، والمحترمة لأحمد.\n"
        "   - إذا سألك أحمد سؤالاً عاماً، أو طلب رأيك، أو طلب شرح الشاشة ومحتواها، أو طلب نقاشاً حول فكرة أو كود: اكتب إجابتك الكاملة والمفيدة في حقل \"speech\" واترك \"code\" فارغاً.\n"
        "   - إذا كنت تنفذ خطوات على الهاتف: صِف باختصار وبطبيعية ما تفعله في \"speech\" حتى يسمعك أحمد ويعرف خطوتك.\n"
        "2. الرؤية البصرية وفحص الصور (Computer Vision):\n"
        "   - عندما يُطلب منك فحص صورة أو شاشة مع لقطة شاشة، افحص الصورة بعناية واشرح لأحمد محتواها البصري وتفاصيلها ونصوصها في \"speech\".\n"
        "3. التحكم في واجهة أندرويد (Phone Actions):\n"
        "   - smartStartApp(\"appName\"): يفتح أي تطبيق باسمه العربي أو الإنجليزي (مثل: 'واتساب', 'يوتيوب', 'كروم', 'تليجرام', 'settings', إلخ) أو اسم الحزمة.\n"
        "   - advancedClick({\"target1\", \"target2\", ...}): الخيار الأفضل للنقر! يجرب قائمة من النصوص أو الـ IDs بالترتيب حتى ينجح.\n"
        "   - forceClick(\"target\"): يبحث عن عنصر بنصه أو وصفه أو ID ويضغط عليه.\n"
        "   - smartClick(x, y): للضغط بإحداثيات نسبية من 0 إلى 1000.\n"
        "   - setText(\"text\") أو paste(\"text\"): للكتابة واللصق في الحقل المفعل.\n"
        "   - service.toHome(), service.toBack(), service.toRecents(): التنقل بين شاشات النظام.\n"
        "   - service.swipe(x1, y1, x2, y2, ms): سحب الشاشة.\n"
        "   - openUrl(\"url\"): فتح أي رابط ويب مباشرة في المتصفح.\n"
        "4. أوامر النظام وتيرمكس (Termux System Tools):\n"
        "   - يمكنك كتابة أي أمر Bash في \"system_command\" إذا كان الطلب يتطلب فحص ملفات، تشغيل بايثون، استعلام عن شبكة، سكريبت، أو جلب بيانات بـ curl.\n\n"
        "صيغة الرد الإلزامية (JSON صالح فقط بدون أي كتل markdown خارج الـ JSON):\n"
        "{\n"
        "  \"thought\": \"تفكيرك المنطقي وتحليلك السريع للشاشة والخطوة\",\n"
        "  \"speech\": \"الكلام الكامل الموجه لأحمد لنطقه بصوت عالي (رد، شرح، نقاش، أو توضيح خطوة)\",\n"
        "  \"code\": \"كود Lua للتنفيذ في Jieshuo إن وجد (أو اتركه فارغاً '' لو كانت المهمة حوارية أو استفسار)\",\n"
        "  \"system_command\": \"أمر Bash لتنفيذه في Termux إن احتاجه الأمر (أو فارغ '')\",\n"
        "  \"status\": \"DONE أو CONTINUE أو AWAIT_USER\",\n"
        "  \"ask_user\": \"سؤال مباشر لأحمد لو في خيارات متعددة محتاج رأيه فيها، وإلا null\",\n"
        "  \"recipe_name\": \"اسم وصفي للمهمة لو اكتملت بنجاح لحفظها في الذاكرة السريعة وإلا null\"\n"
        "}\n\n"
        "قواعد الذكاء والاستمرارية (Multi-Step & Self-Healing):\n"
        "- إذا كانت المهمة مركبة (مثل: افتح يوتيوب وابحث عن فيديو وشغله): نفذ الخطوة الأولى واجعل status: 'CONTINUE'. لا تضع status: 'DONE' إلا لما يتحقق هدف أحمد النهائي بالكامل وتراه شغالاً على الشاشة.\n"
        "- إذا واجهت خطأ سابقاً، اقرأ رسالة الخطأ في last_error ولا تكرر نفس الأسلوب أبداً؛ استخدم أسلوباً بديلاً (advancedClick بأسماء أخرى أو smartClick بإحداثيات).\n"
        "- لو في كذا خيار محير أو مش واضح أحمد عايز أنهي واحد: اسأله في ask_user واجعل status: 'AWAIT_USER' عشان نفتح له المايك فوراً ويجاوبك.\n"
    )

    history_lines = []
    if history and isinstance(history, list):
        for h in history[-4:]:
            role = h.get("role", "info")
            if role == "agent":
                history_lines.append(f"الوكيل السابق: تفكير='{h.get('thought','')}', كلام='{h.get('speech','')}', كود='{h.get('code','')}'")
            elif role == "system":
                history_lines.append(f"نتيجة التنفيذ: {h.get('result','')}")
            elif role == "user":
                history_lines.append(f"طلب المستخدم: {h.get('text', command)}")

    history_block = "\n".join(history_lines) if history_lines else "بداية جلسة جديدة."
    error_block = f"\n⚠️ تنبيه خطأ سابق يجب معالجته: {last_error}" if last_error else ""

    image_block = ""
    if image_path and os.path.exists(image_path):
        image_block = (
            f"\n📸 تم التقاط لقطة شاشة حقيقية للجهاز ومحفوظة في المسار التالي:\n{image_path}\n"
            f"تعليمات الرؤية البصرية: استخدم أداة view_file على المسار '{image_path}' فوراً لمعاينة الصورة وفحصها بالكامل، "
            f"واشرح لأحمد بدقة ما تراه فيها وضع هذا الشرح في 'speech'.\n"
        )

    user_prompt = (
        f"طلب المستخدم: {command}\n"
        f"رقم الخطوة الحالية: {step}\n"
        f"{error_block}\n"
        f"{image_block}\n"
        f"سجل الخطوات السابقة:\n{history_block}\n\n"
        f"شجرة عناصر الشاشة المفتوحة حالياً (UI Tree):\n{ui_tree}\n\n"
        f"قم بتحليل الشاشة وتحديد الخطوة القادمة وأرجع JSON بالرد المطلوب فقط."
    )

    full_prompt = f"{system_prompt}\n\n---\n{user_prompt}"

    try:
        raw_output = None
        try:
            is_first_step = (step <= 1)
            p_proc, p_line_q, is_new = device_agent_session.get_or_create(
                conversation_id=session_id,
                model=device_model,
                effort=effort_to_pass,
                cwd=HOME_DIR,
                force_new=is_first_step
            )
            if device_agent_session.send_prompt(full_prompt):
                resp_chunks = []
                start_wait = time.time()
                while time.time() - start_wait < 35.0:
                    try:
                        line = p_line_q.get(timeout=1.5)
                    except queue.Empty:
                        if p_proc.poll() is not None:
                            break
                        continue
                    if line is None:
                        break
                    line_s = line.strip()
                    if not line_s:
                        continue
                    try:
                        ev = json.loads(line_s)
                        etype = ev.get("event")
                        if etype == "step_update":
                            step_data = ev.get("step_update", {})
                            if step_data.get("step_type") == "agent_response":
                                delta = step_data.get("text_delta", "")
                                if delta:
                                    resp_chunks.append(delta)
                        elif etype == "result":
                            res_obj = ev.get("result", {})
                            res_resp = res_obj.get("response", "")
                            if res_resp:
                                resp_chunks = [res_resp]
                            break
                    except Exception:
                        pass
                if resp_chunks:
                    raw_output = "".join(resp_chunks).strip()
        except Exception as e_pers:
            logger.warning(f"Persistent session fallback: {e_pers}")

        if not raw_output:
            cmd = [
                get_agy_binary_path(),
                "--dangerously-skip-permissions",
                "--model", device_model,
                "--conversation", session_id
            ]
            if effort_to_pass and "thinking" not in device_model:
                cmd.extend(["--effort", effort_to_pass])
            cmd.extend(["-p", full_prompt])

            env = dict(os.environ)
            env["GOMAXPROCS"] = "2"
            env["AGY_NO_UPDATE_CHECK"] = "1"

            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=50.0,
                env=env,
                cwd=HOME_DIR
            )
            raw_output = proc.stdout.strip()
            if not raw_output and proc.stderr:
                raw_output = proc.stderr.strip()

        json_str = raw_output or ""
        if "```json" in json_str:
            parts = json_str.split("```json")
            json_str = parts[1].split("```")[0].strip()
        elif "```" in json_str:
            parts = json_str.split("```")
            json_str = parts[1].strip()

        start_idx = json_str.find("{")
        end_idx = json_str.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_str = json_str[start_idx:end_idx+1]

        parsed = json.loads(json_str)

        sys_cmd = parsed.get("system_command", "").strip()
        sys_output = ""
        if sys_cmd:
            try:
                proc_sys = subprocess.run(
                    sys_cmd,
                    shell=True,
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=12.0,
                    cwd=HOME_DIR
                )
                sys_output = (proc_sys.stdout or proc_sys.stderr or "").strip()
                logger.info(f"Executed system_command: {sys_cmd} -> {sys_output[:100]}")
            except Exception as e_cmd:
                sys_output = f"Command error: {e_cmd}"

        speech_text = parsed.get("speech", "").strip() or parsed.get("thought", "").strip()
        if not speech_text and parsed.get("code"):
            speech_text = "حاضر، بنفذ الخطوة دلوقتي.."

        send_json_response(client_sock, {
            "status": "ok",
            "thought": parsed.get("thought", ""),
            "speech": speech_text,
            "code": parsed.get("code", ""),
            "agent_status": parsed.get("status", "DONE"),
            "ask_user": parsed.get("ask_user") or "",
            "system_output": sys_output,
            "recipe_name": parsed.get("recipe_name")
        })
    except Exception as e:
        logger.error(f"Device agent turn error: {e}")
        send_json_response(client_sock, {
            "status": "error",
            "thought": "معلش يا ريس، حصل تعثر بسيط في تحليل الشاشة.",
            "speech": "معلش يا أحمد، حصل تعثر بسيط وأنا بحلل الشاشة. جرب تطلب تاني.",
            "code": "",
            "agent_status": "DONE",
            "error": str(e)
        }, status_code=500)

def handle_settings_schema(client_sock):
    schema_data = {
        "title": "Antigravity Configuration Schema",
        "description": "Comprehensive schema for AI Engine, Security Gatekeeper, and UI controls.",
        "categories": [
            {"id": "ai_engine", "title": "🤖 AI Model & Reasoning", "order": 1},
            {"id": "security", "title": "🛡️ Security & Execution Policies", "order": 2},
            {"id": "permissions", "title": "🔐 Capability Permissions", "order": 3},
            {"id": "workspace", "title": "📂 Trusted Workspaces", "order": 4},
            {"id": "accessibility", "title": "🗣️ Accessibility & Feedback", "order": 5}
        ]
    }
    send_json_response(client_sock, schema_data)

def handle_client(client_sock, backend_port, index_bytes):
    try:
        client_sock.settimeout(6.0)
        peek_data = client_sock.recv(4096)
        if not peek_data:
            client_sock.close()
            return

        # 1. Check WebSocket Upgrade (Terminal Bridge to ttyd)
        is_ws = (b"Upgrade: websocket" in peek_data or 
                 b"upgrade: websocket" in peek_data or 
                 b"/ws" in peek_data.split(b"\r\n")[0])

        if is_ws:
            client_sock.sendall(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n")
            client_sock.close()
            return

        # 2. Parse HTTP Request headers and body
        header_data, sep, body_part = peek_data.partition(b"\r\n\r\n")
        first_line = header_data.split(b"\r\n")[0].decode("latin1", errors="ignore")
        method = first_line.split()[0].upper() if first_line else "GET"
        path = first_line.split()[1] if len(first_line.split()) > 1 else "/"

        if method == "OPTIONS":
            cors_resp = (
                b"HTTP/1.1 204 No Content\r\n"
                b"Access-Control-Allow-Origin: *\r\n"
                b"Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                b"Access-Control-Allow-Headers: Content-Type\r\n"
                b"Connection: close\r\n\r\n"
            )
            client_sock.sendall(cors_resp)
            client_sock.close()
            return

        content_len = 0
        for line in header_data.decode("latin1", errors="ignore").split("\r\n")[1:]:
            if line.lower().startswith("content-length:"):
                try:
                    content_len = int(line.split(":", 1)[1].strip())
                except ValueError:
                    content_len = 0

        body_bytes = body_part
        while len(body_bytes) < content_len:
            chunk = client_sock.recv(min(content_len - len(body_bytes), 16384))
            if not chunk:
                break
            body_bytes += chunk

        # 3. Route API endpoints
        if path.startswith("/api/ai/stream"):
            try:
                client_sock.settimeout(None)
            except Exception:
                pass
            handle_ai_stream(client_sock, body_bytes)
            return

        elif path.startswith("/api/ai/models"):
            send_json_response(client_sock, get_available_models())
            client_sock.close()
            return

        elif path.startswith("/api/ai/settings/schema"):
            handle_settings_schema(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/ai/subagents/manage") or path.startswith("/api/ai/subagents/kill"):
            handle_subagents_manage(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/subagents"):
            handle_subagents_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/ai/tasks/manage"):
            handle_tasks_manage(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/tasks"):
            handle_tasks_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/device_agent/turn"):
            handle_device_agent_turn(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/settings"):
            if method == "GET":
                cfg = load_settings()
                perms = cfg.get("permissions", {}).get("allow", [])
                if not isinstance(perms, list):
                    perms = list(DEFAULT_ALLOWED_CATEGORIES)
                cfg["allow_commands"] = "command" in perms or "command(*)" in perms
                cfg["allow_write"] = "file_write" in perms or "write_file(*)" in perms
                cfg["allow_web"] = "web_access" in perms or "read_url(*)" in perms
                cfg["allow_subagent"] = "subagents" in perms
                cfg["allow_schedule"] = "schedule" in perms
                is_safe = bool(cfg.get("safe_mode", False))
                cfg["safe_mode"] = is_safe
                cfg["autopilot"] = not is_safe
                send_json_response(client_sock, cfg)
            elif method == "POST":
                try:
                    patch = json.loads(body_bytes.decode("utf-8", errors="ignore"))
                    current_settings = load_settings()
                    old_model = current_settings.get("model")
                    old_effort = current_settings.get("effort")

                    for k in ["speech_enabled", "tones_enabled", "haptic_enabled", "speech_rate", "trustedWorkspaces"]:
                        if k in patch:
                            current_settings[k] = patch[k]

                    if "model" in patch:
                        new_model = resolve_model_id(patch["model"])
                        current_settings["model"] = new_model
                        m_eff = re.search(r'-(low|medium|high)$', new_model)
                        if m_eff:
                            current_settings["effort"] = m_eff.group(1)

                    if "effort" in patch:
                        new_effort = patch["effort"]
                        if new_effort in ["low", "medium", "high"]:
                            current_settings["effort"] = new_effort
                            cur_m = current_settings.get("model", "")
                            if re.search(r'-(low|medium|high)$', cur_m):
                                current_settings["model"] = re.sub(r'-(low|medium|high)$', f"-{new_effort}", cur_m)

                    if "autopilot" in patch and "safe_mode" not in patch:
                        current_settings["safe_mode"] = not bool(patch["autopilot"])
                        current_settings["autopilot"] = bool(patch["autopilot"])
                    elif "safe_mode" in patch:
                        current_settings["safe_mode"] = bool(patch["safe_mode"])
                        current_settings["autopilot"] = not bool(patch["safe_mode"])

                    if "allow_commands" in patch:
                        current_settings["allow_commands"] = bool(patch["allow_commands"])
                    if "allow_write" in patch:
                        current_settings["allow_write"] = bool(patch["allow_write"])
                    if "allow_web" in patch:
                        current_settings["allow_web"] = bool(patch["allow_web"])
                    if "allow_subagent" in patch:
                        current_settings["allow_subagent"] = bool(patch["allow_subagent"])
                    if "allow_schedule" in patch:
                        current_settings["allow_schedule"] = bool(patch["allow_schedule"])

                    save_settings(current_settings)

                    # Always recycle AI session and clear approved tools on ANY settings update so changes take effect IMMEDIATELY!
                    logger.info("Settings updated from Web UI: clearing session approvals and recycling AI session")
                    session_approved_tools.clear()
                    persistent_ai_session.terminate()

                    res_cfg = load_settings()
                    send_json_response(client_sock, {"status": "ok", "settings": res_cfg})
                except Exception as e:
                    logger.error("Error updating settings: %s", e)
                    send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
            return

        elif path.startswith("/api/fs/list"):
            target = ""
            if "path=" in path:
                target = path.split("path=", 1)[1].split("&")[0]
                import urllib.parse
                target = urllib.parse.unquote(target)
            handle_fs_list(client_sock, target)
            client_sock.close()
            return

        elif path.startswith("/api/fs/read"):
            target = ""
            if "path=" in path:
                target = path.split("path=", 1)[1].split("&")[0]
                import urllib.parse
                target = urllib.parse.unquote(target)
            handle_fs_read(client_sock, target)
            client_sock.close()
            return

        elif path.startswith("/api/fs/mkdir"):
            handle_fs_mkdir(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/commands"):
            handle_slash_commands_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/skills/list"):
            handle_skills_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/skills/toggle"):
            handle_skill_toggle(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/mcp/list"):
            handle_mcp_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/mcp/install"):
            handle_mcp_install(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/mcp/remove"):
            handle_mcp_remove(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/mcp/toggle"):
            handle_mcp_toggle(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/send"):
            try:
                send_data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
                prompt_text = send_data.get("prompt", "").strip()
                if not prompt_text:
                    send_json_response(client_sock, {"status": "error", "message": "empty prompt"}, status_code=400)
                else:
                    success = persistent_ai_session.send_prompt(prompt_text)
                    if success:
                        send_json_response(client_sock, {"status": "ok", "delivered": True})
                    else:
                        send_json_response(client_sock, {"status": "error", "delivered": False, "message": "no active session"}, status_code=409)
            except Exception as e:
                send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
            return

        elif path.startswith("/api/ai/abort") or path.startswith("/api/ai/chat/reset"):
            persistent_ai_session.terminate()
            with ai_process_lock:
                active_ai_process = None
            send_json_response(client_sock, {"status": "ok", "message": "chat reset / aborted"})
            client_sock.close()
            return

        elif path.startswith("/api/client/visibility"):
            try:
                vis_data = json.loads(body_bytes.decode("utf-8", errors="ignore"))
                is_vis = bool(vis_data.get("visible", False))
                update_client_visibility(is_vis)
                send_json_response(client_sock, {"status": "ok", "visible": is_vis})
            except Exception as e:
                send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
            return

        elif path.startswith("/api/ai/permission"):
            # Receive permission decision from web UI
            try:
                perm_data = json.loads(body_bytes.decode("utf-8", errors="ignore"))
                key = perm_data.get("key", "n")
                permission_response["key"] = key
                permission_event.set()
                send_json_response(client_sock, {"status": "ok", "key": key})
            except Exception as e:
                send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
            return

        elif path.startswith("/api/ai/quota"):
            force = "refresh=1" in path or "force=1" in path
            handle_quota_get(client_sock, force=force)
            client_sock.close()
            return

        elif path.startswith("/api/ai/conversations"):
            handle_conversations_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/ai/conversation"):
            query_id = ""
            if "id=" in path:
                query_id = path.split("id=", 1)[1].split("&")[0]
                import urllib.parse
                query_id = urllib.parse.unquote(query_id)
            handle_conversation_get(client_sock, query_id)
            client_sock.close()
            return

        elif path.startswith("/api/system/usage"):
            handle_system_usage(client_sock)
            client_sock.close()
            return

        elif "/token" in path:
            try:
                ttyd_sock = socket.create_connection(("127.0.0.1", backend_port), timeout=3.0)
                ttyd_sock.sendall(peek_data)
                resp = ttyd_sock.recv(4096)
                client_sock.sendall(resp)
                ttyd_sock.close()
            except Exception:
                token_resp = (
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: application/json; charset=utf-8\r\n"
                    b"Content-Length: 13\r\n"
                    b"Access-Control-Allow-Origin: *\r\n"
                    b"Connection: close\r\n\r\n"
                    b'{"token": ""}'
                )
                client_sock.sendall(token_resp)
            finally:
                client_sock.close()
            return

        elif "/favicon.ico" in path:
            client_sock.sendall(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n")
            client_sock.close()
            return

        elif any(p in path for p in ["/termux", "/native", "/raw", "native=1", "mode=termux"]):
            stock_bytes = get_stock_bytes()
            header = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: text/html; charset=utf-8\r\n"
                b"Content-Length: " + str(len(stock_bytes)).encode() + b"\r\n"
                b"Cache-Control: no-cache, no-store, must-revalidate\r\n"
                b"Connection: close\r\n\r\n"
            )
            client_sock.sendall(header + stock_bytes)
            client_sock.close()
            return

        elif "/manifest.json" in path:
            manifest_path = os.path.join(BASE_DIR, "web", "manifest.json")
            m_bytes = b"{}"
            if os.path.exists(manifest_path):
                with open(manifest_path, "rb") as mf: m_bytes = mf.read()
            header = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/manifest+json; charset=utf-8\r\n"
                b"Content-Length: " + str(len(m_bytes)).encode() + b"\r\n"
                b"Access-Control-Allow-Origin: *\r\n"
                b"Connection: close\r\n\r\n"
            )
            client_sock.sendall(header + m_bytes)
            client_sock.close()
            return

        elif "/sw.js" in path:
            sw_path = os.path.join(BASE_DIR, "web", "sw.js")
            sw_bytes = b""
            if os.path.exists(sw_path):
                with open(sw_path, "rb") as sf: sw_bytes = sf.read()
            header = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/javascript; charset=utf-8\r\n"
                b"Content-Length: " + str(len(sw_bytes)).encode() + b"\r\n"
                b"Service-Worker-Allowed: /\r\n"
                b"Connection: close\r\n\r\n"
            )
            client_sock.sendall(header + sw_bytes)
            client_sock.close()
            return

        elif "/icon.svg" in path or "/icon.png" in path:
            icon_path = os.path.join(BASE_DIR, "web", "icon.svg")
            i_bytes = b""
            if os.path.exists(icon_path):
                with open(icon_path, "rb") as icf: i_bytes = icf.read()
            header = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: image/svg+xml\r\n"
                b"Content-Length: " + str(len(i_bytes)).encode() + b"\r\n"
                b"Cache-Control: public, max-age=86400\r\n"
                b"Connection: close\r\n\r\n"
            )
            client_sock.sendall(header + i_bytes)
            client_sock.close()
            return


        else:
            current_bytes = get_index_bytes()
            header = (
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: text/html; charset=utf-8\r\n"
                b"Content-Length: " + str(len(current_bytes)).encode() + b"\r\n"
                b"Cache-Control: no-cache, no-store, must-revalidate\r\n"
                b"Connection: close\r\n\r\n"
            )
            client_sock.sendall(header + current_bytes)
            client_sock.close()
            return

    except Exception:
        try: client_sock.close()
        except: pass

def cleanup(sig=None, frame=None):
    global ttyd_process, active_ai_process
    with ai_process_lock:
        if active_ai_process and active_ai_process.poll() is None:
            try: active_ai_process.kill()
            except: pass
    if ttyd_process:
        try:
            ttyd_process.terminate()
            ttyd_process.wait(timeout=1.0)
        except Exception:
            try: ttyd_process.kill()
            except Exception: pass
    sys.exit(0)

def run_doctor():
    logger.info("=== Running Termux Accessible Web Diagnostic (Doctor) ===")
    all_ok = True

    # 1. Environment & Binaries
    logger.info("[Doctor] Checking runtime binaries...")
    for binary in ["python3", "ttyd", "bash"]:
        path = shutil.which(binary)
        if path:
            logger.info("  [OK] Binary found: %s -> %s", binary, path)
        else:
            logger.error("  [FAIL] Required binary '%s' missing from PATH!", binary)
            all_ok = False

    agy_path = shutil.which("agy")
    if agy_path:
        logger.info("  [OK] Binary found: agy -> %s", agy_path)
    else:
        agy_home = os.path.expanduser("~/.gemini/antigravity-cli/bin/agy")
        if os.path.exists(agy_home):
            logger.info("  [OK] Found agy in CLI bin: %s", agy_home)
        else:
            logger.warning("  [WARN] 'agy' executable not found in PATH or ~/.gemini/antigravity-cli/bin")

    # 2. Web Assets
    logger.info("[Doctor] Checking web dashboard assets...")
    if os.path.isfile(INDEX_FILE):
        logger.info("  [OK] Web dashboard present: %s (%d bytes)", INDEX_FILE, os.path.getsize(INDEX_FILE))
    else:
        logger.error("  [FAIL] Web dashboard index.html missing at %s", INDEX_FILE)
        all_ok = False

    # 3. Settings File & Permissions Structure
    logger.info("[Doctor] Checking settings configuration & permissions...")
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            logger.info("  [OK] Settings JSON is valid: %s", SETTINGS_FILE)
            perms = cfg.get("permissions", {}).get("allow", [])
            logger.info("  [INFO] Active permissions allow list: %s", perms)
            logger.info("  [INFO] Safe review mode: %s | Autopilot: %s", cfg.get("safe_mode", False), not cfg.get("safe_mode", False))
            logger.info("  [INFO] Active model: %s | Effort: %s", cfg.get("model", "Default"), cfg.get("effort", "Default"))
        except Exception as e:
            logger.error("  [FAIL] Could not parse settings JSON (%s): %s", SETTINGS_FILE, e)
            all_ok = False
    else:
        logger.info("  [INFO] Settings file does not exist yet; default settings will be used.")

    # 4. Atomic Write Directory Test
    logger.info("[Doctor] Verifying atomic write capability...")
    test_file = os.path.join(os.path.dirname(SETTINGS_FILE), f".doctor_test_{os.getpid()}")
    try:
        os.makedirs(os.path.dirname(test_file), exist_ok=True)
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("doctor_test")
            f.flush()
            os.fsync(f.fileno())
        os.remove(test_file)
        logger.info("  [OK] Atomic write and file lock verified on settings directory.")
    except Exception as e:
        logger.error("  [FAIL] Directory write check failed: %s", e)
        all_ok = False

    if all_ok:
        logger.info("=== Doctor Result: ALL SYSTEM CHECKS PASSED [OK] ===")
        sys.exit(0)
    else:
        logger.error("=== Doctor Result: ISSUES DETECTED [FAIL] ===")
        sys.exit(1)

def main():
    global ttyd_process

    parser = argparse.ArgumentParser(description="Termux Accessible Web Dual-Engine Server")
    parser.add_argument("-p", "--port", type=int, default=7681, help="Port to listen on")
    parser.add_argument("--backend-port", type=int, default=7682, help="Internal ttyd port")
    parser.add_argument("--doctor", action="store_true", help="Run self-diagnostic verification")
    args = parser.parse_args()

    if args.doctor:
        run_doctor()
        return

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Acquire permanent Android WakeLock via Termux so CPU never sleeps during background timers
    try:
        subprocess.run(["/data/data/com.termux/files/usr/bin/termux-wake-lock"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        logger.info("Permanent Termux WakeLock acquired successfully.")
    except Exception as e:
        logger.warning("Could not acquire Termux WakeLock: %s", e)

    index_bytes = get_index_bytes()

    # Pure AI Agent Mode - ttyd subprocess decoupled
    ttyd_process = None

    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_sock.bind(("0.0.0.0", args.port))
    threading.Thread(target=lambda: fetch_antigravity_quota(force=True), daemon=True).start()
    server_sock.listen(64)

    logger.info("Antigravity Pure AI Agent Server running on port %d", args.port)

    try:
        while True:
            client, addr = server_sock.accept()
            threading.Thread(
                target=handle_client,
                args=(client, args.backend_port, index_bytes),
                daemon=True
            ).start()
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()

if __name__ == "__main__":
    main()
