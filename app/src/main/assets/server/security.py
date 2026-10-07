#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Security, Permission Middleware & Broadcasts
# ==============================================================================

import os
import sys
import time
import json
import re
import threading
import subprocess

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import STATE_FILE, logger

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

GENERIC_PERMISSION_WILDCARDS = {
    "command(*)", "write_file(*)", "read_url(*)", "invoke_subagent(*)", "schedule(*)",
    "*", "command", "file_write", "web_access", "subagents", "schedule"
}

def is_generic_permission_wildcard(rule_str):
    if not isinstance(rule_str, str):
        return True
    r = rule_str.strip()
    if r in GENERIC_PERMISSION_WILDCARDS:
        return True
    if re.match(r'^[a-zA-Z_]+\(\s*\*\s*\)$', r):
        return True
    return False

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

