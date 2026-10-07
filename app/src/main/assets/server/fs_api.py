#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - File System API, Skills & Dynamic Slash Commands
# ==============================================================================

import os
import sys
import time
import json
import re
import subprocess
import threading

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import HOME_DIR, AUTH_TOKEN_FILE, get_agy_binary_path, send_json_response, logger

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
    if not os.path.exists(AUTH_TOKEN_FILE):
        return []
    agy_cmd = get_agy_binary_path()
    commands = []
    try:
        env = dict(os.environ)
        env["AGY_AUTO_UPDATE"] = "0"
        env["AGY_NO_UPDATE_CHECK"] = "1"
        env["BROWSER"] = "true"
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

