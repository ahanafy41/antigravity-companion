#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Settings Manager, Plugins & Whitelist
# ==============================================================================

import os
import sys
import time
import json
import subprocess

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import (
    SETTINGS_FILE, WEB_SETTINGS_FILE, CONFIG_JSON_FILE, PLUGINS_DIR, HOME_DIR,
    get_agy_binary_path, send_json_response, logger
)
from models import resolve_model_id
from security import is_generic_permission_wildcard, DEFAULT_ALLOWED_CATEGORIES

def load_settings():
    default_settings = {
        "model": "gemini-3.8-flash-medium",
        "effort": "medium",
        "mode": "accept-edits",
        "sandbox": False,
        "allowNonWorkspaceAccess": True,
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
        ],
        "whitelist": []
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
                    if "allowNonWorkspaceAccess" in data:
                        cfg["allowNonWorkspaceAccess"] = bool(data["allowNonWorkspaceAccess"])
                    if "mode" in data and data["mode"] in ["accept-edits", "plan"]:
                        cfg["mode"] = data["mode"]
                    if "sandbox" in data:
                        cfg["sandbox"] = bool(data["sandbox"])
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
                    for k in ["safe_mode", "autopilot", "allow_commands", "allow_write", "allow_web", "allow_subagent", "allow_schedule", "speech_enabled", "tones_enabled", "haptic_enabled", "trustedWorkspaces", "model", "effort", "mode", "sandbox", "allowNonWorkspaceAccess"]:
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

    # Extract non-wildcard custom whitelist rules from existing permissions
    raw_perms = cfg.get("permissions", {}).get("allow", [])
    custom_whitelist = [r for r in raw_perms if isinstance(r, str) and not is_generic_permission_wildcard(r)]
    cfg["whitelist"] = custom_whitelist

    # Reconstruct strict active allow list from granular toggles + preserve custom whitelist
    active_allow = list(custom_whitelist)
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

        target_mode = data.get("mode", "accept-edits")
        if target_mode not in ["accept-edits", "plan"]:
            target_mode = "accept-edits"

        # 1. Extract and save dedicated web_settings.json
        web_data = {
            "model": data.get("model", "gemini-3.8-flash-medium"),
            "effort": data.get("effort", "medium"),
            "mode": target_mode,
            "sandbox": bool(data.get("sandbox", False)),
            "allowNonWorkspaceAccess": bool(data.get("allowNonWorkspaceAccess", True)),
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
        current_agy = {}
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    current_agy = json.load(f)
                    if not isinstance(current_agy, dict):
                        current_agy = {}
            except Exception:
                current_agy = {}

        # Preserve custom fine-grained permission rules (like command(git ...))!
        existing_rules = current_agy.get("permissions", {}).get("allow", [])
        custom_rules = []
        if isinstance(existing_rules, list):
            for r in existing_rules:
                if isinstance(r, str) and not is_generic_permission_wildcard(r):
                    if r not in custom_rules:
                        custom_rules.append(r)

        agy_allow = list(custom_rules)
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

        current_agy["model"] = web_data["model"]
        current_agy["effort"] = web_data["effort"]
        current_agy["safe_mode"] = web_data["safe_mode"]
        current_agy["allowNonWorkspaceAccess"] = web_data["allowNonWorkspaceAccess"]
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

CONFIG_JSON_FILE = os.path.expanduser("~/.gemini/config/config.json")
PLUGINS_DIR = os.path.expanduser("~/.gemini/config/plugins")

def handle_plugins_list(client_sock):
    plugins = []
    cfg_data = {}
    if os.path.exists(CONFIG_JSON_FILE):
        try:
            with open(CONFIG_JSON_FILE, "r", encoding="utf-8") as f:
                cfg_data = json.load(f)
        except Exception:
            cfg_data = {}
    
    plugins_cfg = cfg_data.get("plugins", {}) if isinstance(cfg_data.get("plugins"), dict) else {}

    if os.path.exists(PLUGINS_DIR):
        for item in sorted(os.listdir(PLUGINS_DIR)):
            item_path = os.path.join(PLUGINS_DIR, item)
            if os.path.isdir(item_path):
                desc = "إضافة مسجلة لـ Antigravity"
                p_cfg = plugins_cfg.get(item, {})
                is_enabled = True
                if isinstance(p_cfg, dict) and "enabled" in p_cfg:
                    is_enabled = bool(p_cfg["enabled"])
                
                manifest_file = os.path.join(item_path, "plugin.json")
                if os.path.exists(manifest_file):
                    try:
                        with open(manifest_file, "r", encoding="utf-8") as pf:
                            p_info = json.load(pf)
                            desc = p_info.get("description") or desc
                    except Exception:
                        pass
                
                plugins.append({
                    "id": item,
                    "name": item,
                    "enabled": is_enabled,
                    "description": desc
                })

    send_json_response(client_sock, {"status": "ok", "plugins": plugins})

def handle_plugins_toggle(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        plugin_id = data.get("id")
        enabled = bool(data.get("enabled", True))
        if not plugin_id:
            send_json_response(client_sock, {"status": "error", "message": "missing plugin id"}, status_code=400)
            return

        cfg_data = {}
        if os.path.exists(CONFIG_JSON_FILE):
            try:
                with open(CONFIG_JSON_FILE, "r", encoding="utf-8") as f:
                    cfg_data = json.load(f)
            except Exception:
                cfg_data = {}
        
        cfg_data.setdefault("plugins", {})
        cfg_data["plugins"].setdefault(plugin_id, {})
        cfg_data["plugins"][plugin_id]["enabled"] = enabled

        temp_cfg = f"{CONFIG_JSON_FILE}.tmp.{os.getpid()}_{int(time.time() * 1000)}"
        with open(temp_cfg, "w", encoding="utf-8") as f:
            json.dump(cfg_data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_cfg, CONFIG_JSON_FILE)

        send_json_response(client_sock, {"status": "ok", "id": plugin_id, "enabled": enabled})
    except Exception as e:
        logger.error("Error toggling plugin: %s", e)
        send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)

def handle_whitelist_get(client_sock):
    cfg = load_settings()
    whitelist = cfg.get("whitelist", [])
    send_json_response(client_sock, {"status": "ok", "whitelist": whitelist})

def handle_whitelist_remove(client_sock, body_bytes):
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        rule = data.get("rule", "").strip()
        if not rule:
            send_json_response(client_sock, {"status": "error", "message": "missing rule"}, status_code=400)
            return

        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    s_data = json.load(f)
                perms = s_data.get("permissions", {}).get("allow", [])
                if isinstance(perms, list) and rule in perms:
                    s_data["permissions"]["allow"] = [r for r in perms if r != rule]
                    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                        json.dump(s_data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.warning("Error removing rule from %s: %s", SETTINGS_FILE, e)

        if os.path.exists(CONFIG_JSON_FILE):
            try:
                with open(CONFIG_JSON_FILE, "r", encoding="utf-8") as f:
                    c_data = json.load(f)
                grants = c_data.get("userSettings", {}).get("globalPermissionGrants", {}).get("allow", [])
                if isinstance(grants, list) and rule in grants:
                    c_data["userSettings"]["globalPermissionGrants"]["allow"] = [r for r in grants if r != rule]
                    with open(CONFIG_JSON_FILE, "w", encoding="utf-8") as f:
                        json.dump(c_data, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.warning("Error removing rule from %s: %s", CONFIG_JSON_FILE, e)

        updated_cfg = load_settings()
        send_json_response(client_sock, {"status": "ok", "whitelist": updated_cfg.get("whitelist", [])})
    except Exception as e:
        logger.error("Error removing whitelist rule: %s", e)
        send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)

def handle_system_version(client_sock):
    agy_bin = get_agy_binary_path()
    version_str = "Antigravity CLI (Termux)"
    try:
        res = subprocess.run([agy_bin, "--help"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=4.0)
        out = res.stdout or res.stderr or ""
        first_line = out.strip().split("\n")[0] if out else ""
        if "Usage of agy." in first_line:
            version_str = first_line.replace("Usage of ", "").split(":")[0]
    except Exception:
        pass
    send_json_response(client_sock, {"status": "ok", "version": version_str, "binary": agy_bin})

def handle_system_update(client_sock):
    agy_bin = get_agy_binary_path()
    try:
        env = dict(os.environ)
        env["AGY_AUTO_UPDATE"] = "1"
        res = subprocess.run([agy_bin, "update", "-y"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60.0, env=env)
        out = (res.stdout or "") + "\n" + (res.stderr or "")
        is_success = (res.returncode == 0)
        send_json_response(client_sock, {
            "status": "ok" if is_success else "error",
            "returncode": res.returncode,
            "output": out.strip()
        })
    except Exception as e:
        logger.error("Error updating agy: %s", e)
        send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)

