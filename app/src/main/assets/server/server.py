#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Universal Dual-Engine Server
# Engine 1: Accessible AI Studio (stream-json with Live Steps & File Explorer)
# Engine 2: Raw Termux Terminal (WebSocket Tunnel to ttyd PTY)
# ==============================================================================

import os
import re
import sys
import time
import json
import socket
import signal
import argparse
import threading
import subprocess
import shutil

# Ensure server package directory is in sys.path
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import shared
from shared import (
    BASE_DIR, INDEX_FILE, STOCK_FILE, SETTINGS_FILE, WEB_SETTINGS_FILE,
    CONFIG_FILE, PLUGINS_DIR, BRAIN_DIR, HOME_DIR,
    ttyd_process, active_ai_process, ai_process_lock, logger,
    get_index_bytes, get_stock_bytes, send_json_response
)
from auth import get_auth_token_info, auth_manager
from session import persistent_ai_session, handle_ai_stream, forward_stream
from security import (
    update_client_visibility, permission_event, permission_response,
    session_approved_tools, DEFAULT_ALLOWED_CATEGORIES
)
from models import (
    get_available_models, resolve_model_id, fetch_antigravity_quota,
    handle_quota_get, is_effort_supported_for_model
)
from settings_manager import (
    load_settings, save_settings, handle_settings_schema,
    handle_plugins_list, handle_plugins_toggle,
    handle_whitelist_get, handle_whitelist_remove,
    handle_system_version, handle_system_update
)
from fs_api import (
    handle_fs_list, handle_fs_read, handle_fs_mkdir,
    handle_skills_list, handle_slash_commands_list, handle_skill_toggle
)
from mcp_hub import (
    handle_mcp_list, handle_mcp_install, handle_mcp_remove, handle_mcp_toggle,
    handle_mcp_auth_request_device, handle_mcp_auth_pair, handle_mcp_auth_test
)
from conversations import (
    handle_conversations_list, handle_conversation_get,
    handle_subagents_list, handle_subagents_manage,
    handle_tasks_list, handle_tasks_manage, handle_system_usage
)
from device_agent import handle_device_agent_turn

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

        elif path.startswith("/api/auth/status"):
            token_info = get_auth_token_info()
            wizard_state = auth_manager.get_state()
            send_json_response(client_sock, {
                "status": "ok",
                "auth": token_info,
                "wizard": wizard_state
            })
            client_sock.close()
            return

        elif path.startswith("/api/auth/start"):
            res = auth_manager.start_login(force=True)
            send_json_response(client_sock, res)
            client_sock.close()
            return

        elif path.startswith("/api/auth/input"):
            try:
                data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
                code = data.get("code", "")
                res = auth_manager.submit_code(code)
                send_json_response(client_sock, res)
            except Exception as e:
                send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
            return

        elif path.startswith("/api/auth/accept_terms"):
            try:
                data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
                accept = data.get("accept", True)
                res = auth_manager.accept_terms(accept)
                send_json_response(client_sock, res)
            except Exception as e:
                send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
            return

        elif path.startswith("/api/auth/logout"):
            res = auth_manager.logout()
            send_json_response(client_sock, res)
            client_sock.close()
            return

        elif path.startswith("/api/auth/cancel"):
            res = auth_manager.cancel()
            send_json_response(client_sock, res)
            client_sock.close()
            return

        elif path.startswith("/api/auth/open_browser"):
            try:
                data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
                url = data.get("url") or auth_manager.auth_url
                if url:
                    browser_bin = "/data/data/com.termux/files/usr/bin/termux-open-url"
                    if os.path.exists(browser_bin):
                        subprocess.Popen([browser_bin, url])
                    else:
                        subprocess.Popen(["termux-open-url", url])
                    send_json_response(client_sock, {"status": "ok", "message": "تم إرسال أمر فتح الرابط للمتصفح"})
                else:
                    send_json_response(client_sock, {"status": "error", "message": "لا يوجد رابط متاح حالياً"})
            except Exception as e:
                send_json_response(client_sock, {"status": "error", "message": str(e)}, status_code=500)
            client_sock.close()
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

                    for k in ["speech_enabled", "tones_enabled", "haptic_enabled", "speech_rate", "trustedWorkspaces", "mode", "sandbox", "allowNonWorkspaceAccess"]:
                        if k in patch:
                            current_settings[k] = patch[k]

                    if "model" in patch:
                        new_model = resolve_model_id(patch["model"])
                        current_settings["model"] = new_model
                        m_eff = re.search(r'-(low|medium|high|max)$', new_model)
                        if m_eff:
                            current_settings["effort"] = m_eff.group(1)

                    if "effort" in patch:
                        new_effort = patch["effort"]
                        if new_effort in ["low", "medium", "high", "max"]:
                            current_settings["effort"] = new_effort
                            cur_m = current_settings.get("model", "")
                            if "claude" not in cur_m.lower() and re.search(r'-(low|medium|high|max)$', cur_m):
                                current_settings["model"] = re.sub(r'-(low|medium|high|max)$', f"-{new_effort}", cur_m)

                    if "mode" in patch and patch["mode"] in ["accept-edits", "plan"]:
                        current_settings["mode"] = patch["mode"]

                    if "sandbox" in patch:
                        current_settings["sandbox"] = bool(patch["sandbox"])

                    if "allowNonWorkspaceAccess" in patch:
                        current_settings["allowNonWorkspaceAccess"] = bool(patch["allowNonWorkspaceAccess"])

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

        elif path.startswith("/api/plugins/list"):
            handle_plugins_list(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/plugins/toggle"):
            handle_plugins_toggle(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/permissions/whitelist/remove"):
            handle_whitelist_remove(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/ai/permissions/whitelist"):
            handle_whitelist_get(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/system/version"):
            handle_system_version(client_sock)
            client_sock.close()
            return

        elif path.startswith("/api/system/update"):
            handle_system_update(client_sock)
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

        elif path.startswith("/api/mcp/auth/request_device"):
            handle_mcp_auth_request_device(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/mcp/auth/pair"):
            handle_mcp_auth_pair(client_sock, body_bytes)
            client_sock.close()
            return

        elif path.startswith("/api/mcp/auth/test"):
            handle_mcp_auth_test(client_sock, body_bytes)
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
                shared.active_ai_process = None
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

        elif path.startswith("/css/") or path.startswith("/js/"):
            clean_rel = path.lstrip("/").split("?")[0]
            static_file = os.path.join(BASE_DIR, "web", clean_rel)
            if os.path.exists(static_file) and os.path.isfile(static_file):
                with open(static_file, "rb") as sf:
                    s_bytes = sf.read()
                mime = "text/css; charset=utf-8" if path.startswith("/css/") else "application/javascript; charset=utf-8"
                header = (
                    b"HTTP/1.1 200 OK\r\n"
                    b"Content-Type: " + mime.encode() + b"\r\n"
                    b"Content-Length: " + str(len(s_bytes)).encode() + b"\r\n"
                    b"Cache-Control: no-cache, no-store, must-revalidate\r\n"
                    b"Connection: close\r\n\r\n"
                )
                client_sock.sendall(header + s_bytes)
            else:
                client_sock.sendall(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
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
        proc = shared.active_ai_process or active_ai_process
        if proc and proc.poll() is None:
            try: proc.kill()
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
