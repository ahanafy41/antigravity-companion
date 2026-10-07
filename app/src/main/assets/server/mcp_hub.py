#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - MCP Hub, RFC 8628 Device Flow & Health Monitor
# ==============================================================================

import os
import sys
import time
import json
import re
import threading
import subprocess
import shlex
import select
import urllib.request
import urllib.parse
import urllib.error

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import HOME_DIR, MCP_CONFIG_PATH, get_agy_binary_path, send_json_response, logger

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
        "icon": "🔍",
        "requires_auth": True,
        "auth_env": "BRAVE_API_KEY",
        "auth_hint": "يتطلب مفتاح Brave Search API"
    },
    {
        "id": "github",
        "name": "GitHub",
        "category": "أدوات التطوير السحابية",
        "description": "إدارة المستودعات وملفات الأكواد وطلبات السحب وفحص القضايا بالتوثيق",
        "command": "npx -y @modelcontextprotocol/server-github",
        "package": "@modelcontextprotocol/server-github",
        "icon": "🐙",
        "requires_auth": True,
        "auth_env": "GITHUB_PERSONAL_ACCESS_TOKEN",
        "auth_hint": "يتطلب توكن GitHub Personal Access Token أو اعتماد Device Flow"
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

def build_bearer_authorization_header(token: str) -> dict:
    """Formats a Bearer authorization header conforming to RFC 6750."""
    clean_token = str(token or "").strip()
    if clean_token.lower().startswith("bearer "):
        clean_token = clean_token[7:].strip()
    return {"Authorization": f"Bearer {clean_token}"}

def create_mcp_initialize_request(client_name: str = "TermuxAccessibleWeb", client_version: str = "1.0.0", protocol_version: str = "2024-11-05", request_id: int = 1) -> dict:
    """Builds a compliant MCP JSON-RPC 2.0 initialize request."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "initialize",
        "params": {
            "protocolVersion": protocol_version,
            "capabilities": {},
            "clientInfo": {
                "name": client_name,
                "version": client_version
            }
        }
    }

def create_mcp_ping_request(request_id: int = 2) -> dict:
    """Builds an MCP JSON-RPC 2.0 ping request for heartbeat and liveness."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "ping"
    }

def create_mcp_server_discover_request(request_id: int = 1) -> dict:
    """Builds an MCP JSON-RPC 2.0 server/discover request for stateless protocol specs (2026+)."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": "server/discover"
    }

def discover_protected_resource_metadata(mcp_server_url: str) -> dict:
    """Discovers OAuth 2.0 protected resource metadata via RFC 9728 or header inspection."""
    try:
        parsed = urllib.parse.urlparse(mcp_server_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        metadata_url = f"{base_url}/.well-known/oauth-protected-resource"
        req = urllib.request.Request(
            metadata_url,
            headers={"User-Agent": "Termux-Antigravity/1.0", "Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                return data if isinstance(data, dict) else {}
    except Exception:
        pass
    return {}

def request_device_authorization(device_endpoint: str, client_id: str, scope: str = "mcp:all", resource: str = "") -> dict:
    """Executes OAuth 2.0 Device Authorization Grant request conforming to RFC 8628."""
    data = {
        "client_id": client_id,
        "scope": scope
    }
    if resource:
        data["resource"] = resource
    encoded_data = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        device_endpoint,
        data=encoded_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "Termux-Antigravity/1.0"
        }
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))

def poll_device_access_token(token_endpoint: str, client_id: str, device_code: str, interval: int = 5, expires_in: int = 1800) -> dict:
    """Polls or exchanges RFC 8628 device authorization code for OAuth access tokens."""
    data = {
        "client_id": client_id,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
    }
    encoded_data = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        token_endpoint,
        data=encoded_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "Termux-Antigravity/1.0"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8", errors="ignore"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        try:
            err_json = json.loads(body)
            return {
                "error": err_json.get("error", "http_error"),
                "error_description": err_json.get("error_description", str(e)),
                "status_code": e.code
            }
        except Exception:
            return {"error": "http_error", "message": str(e), "status_code": e.code}
    except Exception as e:
        return {"error": "request_failed", "message": str(e)}

def atomic_save_mcp_config(servers_dict: dict) -> bool:
    """Atomically persists MCP server configurations with fsync conforming to CRAFT-001."""
    try:
        os.makedirs(os.path.dirname(MCP_CONFIG_PATH), exist_ok=True)
        tmp_path = MCP_CONFIG_PATH + ".tmp"
        full_data = {"mcpServers": servers_dict}
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(full_data, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, MCP_CONFIG_PATH)
        return True
    except Exception as e:
        logger.error("Failed to atomically save MCP config: %s", e)
        return False

def test_http_mcp_server_health(url: str, headers: dict = None, timeout: float = 8.0) -> dict:
    """Validates connectivity and protocol responsiveness of a remote HTTP MCP server."""
    headers = headers or {}
    start_time = time.time()
    req_headers = {"User-Agent": "Termux-Antigravity/1.0", "Accept": "application/json, text/event-stream"}
    for k, v in headers.items():
        req_headers[k] = v

    try:
        init_body = json.dumps(create_mcp_initialize_request()).encode("utf-8")
        post_headers = dict(req_headers)
        post_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=init_body, headers=post_headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            latency_ms = round((time.time() - start_time) * 1000, 1)
            raw = resp.read().decode("utf-8", errors="ignore")
            auth_valid = resp.status < 400
            try:
                resp_json = json.loads(raw)
                has_result = "result" in resp_json or "capabilities" in str(resp_json)
                return {
                    "healthy": True,
                    "status_code": resp.status,
                    "latency_ms": latency_ms,
                    "auth_valid": auth_valid,
                    "protocol_supported": has_result,
                    "server_info": resp_json.get("result", {}).get("serverInfo", {}),
                    "message": "تم الاتصال بخادم MCP بنجاح واستقبال موافقة البروتوكول"
                }
            except Exception:
                return {
                    "healthy": True,
                    "status_code": resp.status,
                    "latency_ms": latency_ms,
                    "auth_valid": auth_valid,
                    "protocol_supported": True,
                    "message": f"تم الاتصال بالخادم بنجاح (كود الحالة: {resp.status})"
                }
    except urllib.error.HTTPError as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        if e.code in [401, 403]:
            return {
                "healthy": False,
                "status_code": e.code,
                "latency_ms": latency_ms,
                "auth_valid": False,
                "protocol_supported": True,
                "error": "فشل التحقق: التوكن غير صالح أو منتهي الصلاحية (401/403 Unauthorized)",
                "message": "يرجى التحقق من صحة التوكن وإعادة المصادقة"
            }
        elif e.code in [404, 405]:
            try:
                get_req = urllib.request.Request(url, headers=req_headers, method="GET")
                with urllib.request.urlopen(get_req, timeout=timeout) as get_resp:
                    return {
                        "healthy": True,
                        "status_code": get_resp.status,
                        "latency_ms": latency_ms,
                        "auth_valid": True,
                        "protocol_supported": True,
                        "message": "تم الاتصال بالخادم (SSE Stream Endpoint)"
                    }
            except Exception as get_err:
                return {
                    "healthy": False,
                    "status_code": e.code,
                    "latency_ms": latency_ms,
                    "auth_valid": False,
                    "error": str(get_err),
                    "message": f"خطأ في الاتصال بالمسار ({e.code})"
                }
        return {
            "healthy": False,
            "status_code": e.code,
            "latency_ms": latency_ms,
            "auth_valid": False,
            "error": str(e),
            "message": f"رفض الخادم الطلب برمز خطأ {e.code}"
        }
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 1)
        return {
            "healthy": False,
            "status_code": 0,
            "latency_ms": latency_ms,
            "auth_valid": False,
            "error": str(e),
            "message": f"تعذر الوصول إلى الخادم: {str(e)}"
        }

def test_stdio_mcp_server_health(command: str, args: list = None, env: dict = None, timeout: float = 10.0) -> dict:
    """Validates execution and JSON-RPC lifecycle of a local STDIO MCP server subprocess."""
    args = args or []
    env_vars = os.environ.copy()
    if env:
        for k, v in env.items():
            env_vars[str(k)] = str(v)

    full_cmd = [command] + list(args)
    start_time = time.time()
    try:
        proc = subprocess.Popen(
            full_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env_vars,
            text=True
        )

        init_req = json.dumps(create_mcp_initialize_request()) + "\n"
        proc.stdin.write(init_req)
        proc.stdin.flush()

        rlist, _, _ = select.select([proc.stdout], [], [], timeout)
        latency_ms = round((time.time() - start_time) * 1000, 1)
        if rlist:
            line = proc.stdout.readline()
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            if line:
                try:
                    resp_json = json.loads(line)
                    return {
                        "healthy": True,
                        "status_code": 200,
                        "latency_ms": latency_ms,
                        "auth_valid": True,
                        "protocol_supported": True,
                        "server_info": resp_json.get("result", {}).get("serverInfo", {}),
                        "message": "تم تشغيل الخادم والرد على بروتوكول MCP بنجاح"
                    }
                except Exception:
                    return {
                        "healthy": True,
                        "status_code": 200,
                        "latency_ms": latency_ms,
                        "auth_valid": True,
                        "protocol_supported": True,
                        "message": "تم تشغيل الخادم المحلي والرد على الدخل القياسي"
                    }

        try:
            proc.terminate()
            _, stderr_out = proc.communicate(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
            stderr_out = ""

        return {
            "healthy": False,
            "status_code": 504,
            "latency_ms": latency_ms,
            "auth_valid": False,
            "error": "انتهت المهلة الزمنية لانتظار رد البروتوكول (STDIO Timeout)",
            "stderr": stderr_out.strip() if stderr_out else "",
            "message": "البرنامج لم يرد ببيانات JSON-RPC في الوقت المحدد"
        }
    except FileNotFoundError:
        return {
            "healthy": False,
            "status_code": 404,
            "latency_ms": 0,
            "auth_valid": False,
            "error": f"الأمر غير موجود في النظام: {command}",
            "message": "تأكد من تثبيت الحزمة أو الأمر المطلوب (مثل npx أو python)"
        }
    except Exception as e:
        return {
            "healthy": False,
            "status_code": 500,
            "latency_ms": round((time.time() - start_time) * 1000, 1),
            "auth_valid": False,
            "error": str(e),
            "message": f"حدث خطأ أثناء تشغيل خادم STDIO: {str(e)}"
        }

def handle_mcp_auth_request_device(client_sock, body_bytes):
    """Handles OAuth 2.0 Device Code requests (RFC 8628) for MCP servers."""
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        server_name = str(data.get("name", "")).strip()
        device_endpoint = str(data.get("device_endpoint", "")).strip()
        client_id = str(data.get("client_id", "")).strip()
        scope = str(data.get("scope", "mcp:all")).strip()
        resource = str(data.get("resource", "")).strip()

        if not device_endpoint:
            if "github" in server_name.lower():
                device_endpoint = "https://github.com/login/device/code"
                if not client_id:
                    send_json_response(client_sock, {
                        "status": "ok",
                        "auth_type": "token_preferred",
                        "server_name": server_name,
                        "verification_uri": "https://github.com/settings/tokens",
                        "message": "خادم GitHub يدعم إدخال Personal Access Token مباشرة بأمان وسرعة، أو استخدام Device Flow.",
                        "auth_hint": "أنشئ توكن من صفحة إعدادات GitHub والصقه في حقل التوكن أدناه."
                    })
                    return
            else:
                config_servers = load_mcp_servers_from_config()
                srv_info = config_servers.get(server_name, {})
                srv_url = srv_info.get("url", "")
                if srv_url:
                    meta = discover_protected_resource_metadata(srv_url)
                    device_endpoint = meta.get("device_authorization_endpoint", "")
                    if not client_id:
                        client_id = meta.get("client_id", "termux-mcp-client")

        if not device_endpoint or not client_id:
            send_json_response(client_sock, {
                "status": "manual_token_required",
                "server_name": server_name,
                "message": "هذا البروتوكول يتطلب إدخال التوكن أو مفتاح API مباشرة (Bearer Token / API Key).",
                "default_var": "API_KEY"
            })
            return

        res = request_device_authorization(device_endpoint, client_id, scope, resource)
        send_json_response(client_sock, {
            "status": "ok",
            "server_name": server_name,
            "device_code": res.get("device_code", ""),
            "user_code": res.get("user_code", ""),
            "verification_uri": res.get("verification_uri", "") or res.get("verification_uri_complete", ""),
            "verification_uri_complete": res.get("verification_uri_complete", ""),
            "expires_in": res.get("expires_in", 900),
            "interval": res.get("interval", 5),
            "message": "تم إنشاء كود التحقق بنجاح. افتح الرابط وأدخل الكود."
        })
    except Exception as e:
        send_json_response(client_sock, {
            "status": "error",
            "error": str(e),
            "message": f"فشل بدء جلسة التحقق من الجهاز: {str(e)}"
        }, status_code=500)

def handle_mcp_auth_pair(client_sock, body_bytes):
    """Pairs and saves an MCP server token or authorization code into configuration."""
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        name = str(data.get("name", "")).strip()
        auth_mode = str(data.get("auth_mode", "token")).strip()
        token = str(data.get("token", "")).strip()
        var_name = str(data.get("var_name", "")).strip()
        device_code = str(data.get("device_code", "")).strip()
        token_endpoint = str(data.get("token_endpoint", "")).strip()
        client_id = str(data.get("client_id", "")).strip()
        server_type = str(data.get("server_type", "")).strip()
        url = str(data.get("url", "")).strip()
        command = str(data.get("command", "")).strip()

        if not name:
            send_json_response(client_sock, {"status": "error", "error": "اسم البروتوكول مطلوب (name required)"}, status_code=400)
            return

        if auth_mode == "device" and device_code and token_endpoint:
            poll_res = poll_device_access_token(token_endpoint, client_id, device_code)
            if "error" in poll_res:
                err_code = poll_res.get("error", "")
                if err_code == "authorization_pending":
                    send_json_response(client_sock, {
                        "status": "pending",
                        "message": "المصادقة قيد الانتظار: يرجى الموافقة في المتصفح أولاً ثم الضغط على تحقق مجدداً."
                    })
                    return
                elif err_code == "slow_down":
                    send_json_response(client_sock, {
                        "status": "pending",
                        "message": "مهلة الانتظار: يرجى الانتظار بضع ثوانٍ قبل إعادة المحاولة."
                    })
                    return
                else:
                    send_json_response(client_sock, {
                        "status": "error",
                        "error": poll_res.get("error_description", err_code),
                        "message": f"فشل التحقق: {poll_res.get('error_description', err_code)}"
                    }, status_code=400)
                    return
            token = poll_res.get("access_token", "")

        if not token:
            send_json_response(client_sock, {"status": "error", "error": "رمز التحقق أو التوكن مطلوب (token required)"}, status_code=400)
            return

        if token.lower().startswith("bearer "):
            token = token[7:].strip()

        config_servers = load_mcp_servers_from_config()
        cat_item = next((c for c in MCP_APPROVED_CATALOG if c["id"] == name), None)

        if name in config_servers:
            srv = config_servers[name]
            is_http = (srv.get("type") == "http") or bool(srv.get("url")) or (server_type == "http")
            if is_http:
                headers = srv.get("headers", {})
                headers["Authorization"] = f"Bearer {token}"
                srv["headers"] = headers
            else:
                env = srv.get("env", {})
                effective_var = var_name or (cat_item.get("auth_env") if cat_item else "") or "API_KEY"
                env[effective_var] = token
                srv["env"] = env
        else:
            if cat_item:
                cat_cmd = cat_item["command"]
                parts = shlex.split(cat_cmd)
                effective_var = var_name or cat_item.get("auth_env") or "API_KEY"
                config_servers[name] = {
                    "command": parts[0] if parts else "npx",
                    "args": parts[1:] if len(parts) > 1 else [],
                    "env": {effective_var: token},
                    "disabled": False
                }
            elif url or server_type == "http":
                config_servers[name] = {
                    "type": "http",
                    "url": url or f"https://{name}.com/mcp",
                    "headers": {"Authorization": f"Bearer {token}"},
                    "disabled": False
                }
            else:
                cmd_parts = shlex.split(command) if command else ["npx", "-y", f"@modelcontextprotocol/server-{name}"]
                effective_var = var_name or "API_KEY"
                config_servers[name] = {
                    "command": cmd_parts[0],
                    "args": cmd_parts[1:],
                    "env": {effective_var: token},
                    "disabled": False
                }

        saved_ok = atomic_save_mcp_config(config_servers)
        if not saved_ok:
            send_json_response(client_sock, {"status": "error", "error": "فشل حفظ إعدادات البروتوكول على القرص"}, status_code=500)
            return

        run_agy_mcp_command(["list"], timeout=5)

        send_json_response(client_sock, {
            "status": "ok",
            "message": f"تم توثيق وربط البروتوكول '{name}' بنجاح وحفظ أوراق الاعتماد",
            "name": name,
            "has_token": True
        })
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "error": str(e)}, status_code=500)

def handle_mcp_auth_test(client_sock, body_bytes):
    """Executes a diagnostic health check probe on an MCP server with current credentials."""
    try:
        data = json.loads(body_bytes.decode("utf-8", errors="ignore")) if body_bytes else {}
        name = str(data.get("name", "")).strip()

        config_servers = load_mcp_servers_from_config()
        server_info = config_servers.get(name, {})

        srv_type = server_info.get("type", "stdio")
        url = server_info.get("url", "") or data.get("url", "")
        command = server_info.get("command", "") or data.get("command", "")
        args = server_info.get("args", []) or data.get("args", [])
        env = server_info.get("env", {}) or data.get("env", {})
        headers = server_info.get("headers", {}) or data.get("headers", {})

        test_token = str(data.get("token", "")).strip()
        if test_token:
            if test_token.lower().startswith("bearer "):
                test_token = test_token[7:].strip()
            if url or srv_type == "http":
                headers = dict(headers)
                headers["Authorization"] = f"Bearer {test_token}"
            else:
                env = dict(env)
                var_name = str(data.get("var_name", "API_KEY")).strip()
                env[var_name] = test_token

        if url or srv_type == "http":
            report = test_http_mcp_server_health(url, headers=headers, timeout=8.0)
        elif command:
            report = test_stdio_mcp_server_health(command, args=args, env=env, timeout=10.0)
        else:
            send_json_response(client_sock, {
                "status": "error",
                "error": f"البروتوكول '{name}' غير مثبت ولا يحتوي على أمر أو رابط للاختبار"
            }, status_code=400)
            return

        send_json_response(client_sock, {
            "status": "ok",
            "name": name,
            "report": report
        })
    except Exception as e:
        send_json_response(client_sock, {"status": "error", "error": str(e)}, status_code=500)

