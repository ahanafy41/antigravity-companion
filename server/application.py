"""Versioned local HTTP API with independent CLI and Android state."""

import asyncio
import json
import hashlib
import hmac
import re
import secrets
import time
from pathlib import Path
from aiohttp import web
from android_client import AndroidClient
from cli_client import CLI, CLIUnavailable
from cli_settings import CLISettings
from auth_flow import AuthFlow
from mcp_probe import MCPProbe
from mcp_settings import MCPSettings
from task_runtime import TaskRuntime
from local_tasks import LocalTasks
from voice_agent import VoiceAgent
from voice_planner import VoicePlanner
from legacy_conversations import LegacyConversations
from security import COOKIE, Pairing, error, isolation
from sessions import RunConflict, Sessions, TERMINAL
from runtime_status import CLIAdministration, system_usage
from storage import (
    AtomicStore,
    StorageConflict,
    WorkspacePaths,
    redact,
    public_document,
    merge_document,
)

VERSION = json.loads(
    Path(__file__).with_name("version.json").read_text(encoding="utf-8")
)["version_name"]


@web.middleware
async def failures(request, handler):
    try:
        return await handler(request)
    except StorageConflict:
        return error(
            "revision_conflict", "The document changed; reload it", 409
        )
    except RunConflict as failure:
        return error("run_conflict", str(failure), 409)
    except CLIUnavailable as failure:
        return error("unavailable", str(failure), 503)
    except PermissionError:
        return error(
            "forbidden_path", "Path is outside configured workspaces", 403
        )
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return error(
            "invalid_request", "The request or stored document is invalid", 400
        )
    except web.HTTPException as failure:
        return error("http_error", failure.reason, failure.status)
    except KeyError:
        return error("not_found", "The requested record was not found", 404)
    except FileNotFoundError:
        return error("not_found", "The requested file was not found", 404)
    except OSError:
        return error("storage_failure", "Local storage is unavailable", 503)


def create_app(data_dir, port=7681):
    store = AtomicStore(data_dir)
    store.import_legacy(Path.home())
    application = web.Application(
        middlewares=[failures, isolation], client_max_size=1024 * 1024
    )
    application["instance_id"] = instance_identity(store)
    application["port"] = port
    application["shutdown_callback"] = None
    application["shutdown_requested"] = False
    application["store"] = store
    application["pairing"] = Pairing()
    application["cli"] = CLI()
    application["cli_settings"] = CLISettings()
    application["cli_admin"] = CLIAdministration(application["cli"], store)
    application["sessions"] = Sessions(store, application["cli"])
    application["local_tasks"] = LocalTasks(
        store,
        application["sessions"],
        ready=lambda: not application["cli_admin"].updating,
    )
    application["android"] = AndroidClient(store)
    application["auth_flow"] = AuthFlow(application["cli"].available)
    application["mcp_probe"] = MCPProbe()
    application["mcp_settings"] = MCPSettings(Path.home())
    application["task_runtime"] = TaskRuntime(application["sessions"])
    application["sessions"].observer = application["task_runtime"].observe
    application["voice_agent"] = VoiceAgent(
        store,
        VoicePlanner(application["cli"], store.root),
        application["android"],
    )
    application["visibility"] = {}
    application["legacy"] = LegacyConversations(Path.home())
    application["catalog_cache"] = {
        ("models", None): (list(DEFAULT_MODELS_CATALOG), time.time())
    }
    application.on_startup.append(start_local_tasks)
    application.on_cleanup.append(close_app)
    application.on_response_prepare.append(response_headers)
    register_routes(application)
    return application


async def start_local_tasks(application):
    await application["local_tasks"].start()


async def close_app(application):
    try:
        async with asyncio.timeout(2.5):
            await application["local_tasks"].close()
            await application["voice_agent"].close()
            await application["sessions"].close()
    except (asyncio.TimeoutError, Exception):
        pass


def register_routes(application):
    routes = [
        web.get("/health", health),
        web.post("/api/v1/pair", pair),
        web.post("/api/v1/android/bootstrap", android_bootstrap),
        web.get("/api/v1/auth/session", auth_session),
        web.get("/api/v1/auth/status", auth_status),
        web.post("/api/v1/auth/login", auth_login),
        web.post("/api/v1/auth/logout", auth_logout),
        web.post("/api/v1/auth/{request_id}/cancel", cancel_auth),
        web.post("/api/v1/mcp/{name}/test", test_mcp),
        web.post("/api/v1/mcp/{name}/authenticate", authenticate_mcp),
        web.get("/api/v1/mcp/{name}/oauth", get_mcp_oauth),
        web.patch("/api/v1/mcp/{name}/oauth", save_mcp_oauth),
        web.get("/api/v1/local-tasks", list_local_tasks),
        web.post("/api/v1/local-tasks", create_local_task),
        web.get("/api/v1/local-tasks/{task_id}", local_task_detail),
        web.post("/api/v1/local-tasks/{task_id}/cancel", cancel_local_task),
        web.get("/api/v1/tasks", list_tasks),
        web.post("/api/v1/tasks/{run_id}/cancel", cancel_task),
        web.post(
            "/api/v1/voice/requests/{request_id}/cancel", cancel_voice_request
        ),
        web.get("/api/v1/voice/runs", list_voice_runs),
        web.post("/api/v1/voice/runs", start_voice_agent),
        web.get("/api/v1/voice/runs/{voice_id}", voice_detail),
        web.post("/api/v1/voice/runs/{voice_id}/cancel", cancel_voice_agent),
        web.post("/api/v1/client/visibility", client_visibility),
        web.get("/api/v1/capabilities", capabilities),
        web.get("/api/v1/settings", get_settings),
        web.patch("/api/v1/settings", save_settings),
        web.put("/api/v1/settings", save_settings),
        web.get("/api/v1/cli/policy", get_cli_policy),
        web.patch("/api/v1/cli/policy", save_cli_policy),
        web.get("/api/v1/cli/settings", get_cli_settings),
        web.patch("/api/v1/cli/settings", save_cli_settings),
        web.put("/api/v1/cli/settings", save_cli_settings),
        web.get("/api/v1/sessions", list_sessions),
        web.post("/api/v1/sessions", create_session),
        web.get("/api/v1/sessions/{session_id}", session_detail),
        web.post("/api/v1/sessions/{session_id}/close", close_session),
        web.post("/api/v1/sessions/{session_id}/runs", start_run),
        web.get("/api/v1/runs/{run_id}", run_detail),
        web.post("/api/v1/runs/{run_id}/cancel", cancel_run),
        web.get("/api/v1/runs/{run_id}/events", stream_events),
        web.post("/api/v1/permission", handle_permission),
        web.post("/api/ai/permission", handle_permission),
        web.get("/api/v1/artifacts", list_artifacts),
        web.get("/api/v1/artifacts/content", read_artifact),
        web.get("/api/v1/files", list_files),
        web.get("/api/v1/file", read_file),
        web.post("/api/v1/directories", create_directory),
        web.get("/api/v1/mcp", list_cli),
        web.post("/api/v1/mcp", add_mcp),
        web.post("/api/v1/mcp/{name}/{action:enable|disable}", change_mcp),
        web.delete("/api/v1/mcp/{name}", delete_mcp),
        web.post("/api/v1/device/actions", device_action),
        web.get("/api/v1/device/epoch", device_epoch),
        web.post("/api/v1/system/shutdown", shutdown_server),
        web.post("/api/shutdown", shutdown_server),
        web.get("/api/v1/system/usage", local_usage),
        web.get("/api/v1/quota", account_quota),
        web.get("/api/v1/system/cli-version", cli_version),
        web.get("/api/v1/system/versions", system_versions),
        web.post("/api/v1/system/cli-update", cli_update),
        web.get("/api/v1/doctor", doctor_status),
        web.post(
            "/api/v1/plugins/{name}/{action:enable|disable}", change_catalog
        ),
        web.post(
            "/api/v1/skills/{name}/{action:enable|disable}", change_catalog
        ),
    ]
    for kind in ("models", "agents", "skills", "commands", "plugins"):
        routes.append(web.get("/api/v1/" + kind, list_cli))
    routes.append(web.route("*", r"/api/{tail:(?!v1(?:/|$)).*}", legacy_api))
    routes.append(web.get("/", index))
    routes.append(web.get("/start", start_page))
    routes[0:0] = [
        web.get("/api/v1/legacy/conversations", list_legacy),
        web.get("/api/v1/legacy/conversations/{conversation_id}", read_legacy),
    ]
    application.add_routes(routes)
    root_assets = (
        "main-ui.js",
        "main-ui.css",
        "main-v1-adapter.js",
        "start-ui.js",
        "start-ui.css",
        "api.js",
        "history.js",
        "state.js",
        "native.js",
        "ui.js",
        "styles.css",
        "sw.js",
        "manifest.json",
        "icon.svg",
    )
    vendors = (
        "alpine-csp.min.js",
        "marked.umd.js",
        "purify.min.js",
        "tailwind.min.css",
    )
    for asset in root_assets:
        application.router.add_get("/" + asset, static_file)
    for asset in vendors:
        application.router.add_get("/vendor/" + asset, static_file)
    assets = Path(__file__).resolve().parent / "web" / "assets"
    if assets.exists():
        application.router.add_static("/assets", assets)


async def health(request):
    identity = {
        "service": "antigravity-companion",
        "identity": "antigravity-companion",
        "api_versions": [1],
        "version": VERSION,
        "device_protocol": "journal_ready_epoch_v1",
        "instance_id": request.app["instance_id"],
    }
    nonce = request.query.get("android_nonce")
    if nonce is not None:
        if not re.fullmatch(r"[0-9A-Fa-f]{64}", nonce):
            raise ValueError(
                "Android nonce must contain exactly 64 hex digits"
            )
        android = request.app["android"]
        if android.reload_configuration():
            identity["android_proof"] = hmac.new(
                android.configuration["android_token"].encode("utf-8"),
                nonce.encode("ascii"),
                hashlib.sha256,
            ).hexdigest()
    return web.json_response(identity)


async def pair(request):
    payload = await object_body(request)
    paired = request.app["pairing"].pair(payload.get("code"))
    if not paired:
        cookie, csrf = request.app["pairing"].new_session()
    else:
        cookie, csrf = paired
    response = web.json_response({"csrf_token": csrf})
    response.set_cookie(
        COOKIE,
        cookie,
        httponly=True,
        samesite="Lax",
        max_age=86400 * 30,
        path="/",
    )
    return response


async def android_bootstrap(request):
    cookie, csrf = request.app["pairing"].new_session()
    response = web.json_response({"csrf_token": csrf})
    response.set_cookie(
        COOKIE,
        cookie,
        httponly=True,
        samesite="Lax",
        max_age=86400 * 30,
        path="/",
    )
    return response


async def auth_session(request):
    pairing = request.app["pairing"]
    cookie = request.cookies.get(COOKIE, "")
    if pairing.authorized(cookie):
        csrf = pairing.sessions[cookie][0]
        return web.json_response(
            {"authenticated": True, "csrf_token": csrf},
            headers={"Cache-Control": "no-store"},
        )
    cookie, csrf = pairing.new_session()
    response = web.json_response(
        {"authenticated": True, "csrf_token": csrf},
        headers={"Cache-Control": "no-store"},
    )
    response.set_cookie(
        COOKIE,
        cookie,
        httponly=True,
        samesite="Strict",
        max_age=86400 * 30,
        path="/",
    )
    return response


async def auth_status(request):
    return web.json_response(request.app["auth_flow"].status())


async def auth_login(request):
    return web.json_response(
        request.app["auth_flow"].start(
            "account",
            cwd=str(trusted_cli_cwd(request, await object_body(request))),
        )
    )


async def auth_logout(request):
    payload = await object_body(request)
    if payload.get("confirmed") is not True:
        raise ValueError("Confirm native account logout explicitly")
    if (
        request.app["cli_admin"].updating
        or any(
            run["state"] == "running"
            for run in request.app["sessions"].runs.values()
        )
        or any(
            run["state"] == "running"
            for run in request.app["voice_agent"].runs.values()
        )
    ):
        raise RunConflict("Stop owned CLI work before native logout")
    return web.json_response(
        request.app["auth_flow"].start(
            "logout", cwd=str(trusted_cli_cwd(request, payload))
        )
    )


async def cancel_auth(request):
    return web.json_response(
        request.app["auth_flow"].cancel(request.match_info["request_id"])
    )


def trusted_cli_cwd(request, payload=None):
    payload = payload or {}
    if payload.get("session_id"):
        return Path(
            request.app["sessions"].sessions[payload["session_id"]]["cwd"]
        )
    settings = request.app["store"].read("settings")
    return api_path(
        request, payload.get("cwd", settings.get("cwd", str(Path.home())))
    )


async def test_mcp(request):
    return web.json_response(
        await request.app["mcp_probe"].test(
            request.match_info["name"],
            trusted_cli_cwd(request, await object_body(request)),
        )
    )


async def authenticate_mcp(request):
    name = request.match_info["name"]
    request.app["mcp_settings"].read_oauth(
        name, trusted_cli_cwd(request, await object_body(request))
    )
    return web.json_response(
        request.app["auth_flow"].start(
            "mcp",
            name,
            cwd=str(trusted_cli_cwd(request, await object_body(request))),
        )
    )


async def get_mcp_oauth(request):
    return web.json_response(
        request.app["mcp_settings"].read_oauth(
            request.match_info["name"],
            trusted_cli_cwd(request, dict(request.query)),
        )
    )


async def save_mcp_oauth(request):
    payload = await object_body(request)
    return web.json_response(
        request.app["mcp_settings"].write_oauth(
            request.match_info["name"],
            trusted_cli_cwd(request, payload),
            payload.get("oauth", {}),
            payload.get("revision"),
        )
    )


async def list_local_tasks(request):
    return web.json_response(request.app["local_tasks"].listing())


async def create_local_task(request):
    return web.json_response(
        request.app["local_tasks"].create(await object_body(request)),
        status=202,
    )


async def local_task_detail(request):
    return web.json_response(
        request.app["local_tasks"].detail(request.match_info["task_id"])
    )


async def cancel_local_task(request):
    return web.json_response(
        await request.app["local_tasks"].cancel(request.match_info["task_id"])
    )


async def list_tasks(request):
    return web.json_response(request.app["task_runtime"].listing())


async def cancel_task(request):
    return web.json_response(
        await request.app["task_runtime"].cancel(request.match_info["run_id"])
    )


async def start_voice_agent(request):
    if request.app["cli_admin"].updating:
        raise RunConflict("CLI update is in progress")
    payload = await object_body(request)
    session = request.app["sessions"].sessions[payload["session_id"]]
    return web.json_response(
        request.app["voice_agent"].start(session, payload), status=202
    )


async def cancel_voice_request(request):
    return web.json_response(
        await request.app["voice_agent"].cancel_request(
            request.match_info["request_id"]
        )
    )


async def list_voice_runs(request):
    return web.json_response(
        {
            "runs": [
                {
                    key: run.get(key)
                    for key in ("voice_id", "state", "created_at")
                }
                for run in request.app["voice_agent"].runs.values()
            ]
        }
    )


async def voice_detail(request):
    return web.json_response(
        request.app["voice_agent"].detail(request.match_info["voice_id"])
    )


async def cancel_voice_agent(request):
    return web.json_response(
        await request.app["voice_agent"].cancel(request.match_info["voice_id"])
    )


async def client_visibility(request):
    payload = await object_body(request)
    if type(payload.get("visible")) is not bool:
        raise ValueError("visible must be boolean")
    client_id = payload.get("client_id", "web")
    if not isinstance(client_id, str) or not re.fullmatch(
        r"[A-Za-z0-9._-]{1,128}", client_id
    ):
        raise ValueError("Invalid visibility client_id")
    clients = request.app["visibility"]
    if len(clients) >= 64 and client_id not in clients:
        clients.pop(next(iter(clients)))
    clients[client_id] = payload["visible"]
    return web.json_response(
        {"visible": payload["visible"], "client_id": client_id}
    )


async def capabilities(request):
    installed = request.app["cli"].available
    entries = []
    for kind in (
        "chat",
        "models",
        "agents",
        "mcp",
        "files",
        "settings",
        "device",
        "quota",
        "plugins",
        "skills",
        "commands",
        "auth",
        "tasks",
        "voice",
    ):
        available = (
            kind in ("files", "settings", "tasks")
            or installed
            and kind
            in (
                "chat",
                "models",
                "agents",
                "mcp",
                "plugins",
                "skills",
                "commands",
                "quota",
                "auth",
            )
        )
        if kind == "device":
            available = request.app["android"].available
        reason = (
            ""
            if available
            else "Capability requires an available authenticated CLI/device"
        )
        if kind == "device" and available:
            reason = (
                "Android token configured; actual connectivity "
                "is checked by an action"
            )
        if kind == "auth":
            reason = "Native agy login handoff; account state remains unknown"
        if kind == "voice":
            available = installed and request.app["android"].available
            reason = "Bounded voice planner; native device proof required"
        entry = {"id": kind, "available": bool(available), "reason": reason}
        if kind in ("plugins", "skills"):
            try:
                entry["actions"] = await request.app["cli"].catalog_actions(
                    kind
                )
            except CLIUnavailable:
                entry["actions"] = []
            if not entry["actions"]:
                entry["reason"] = (
                    "Read-only catalog; manage this customization "
                    "in Termux CLI"
                )
        entries.append(entry)
    return web.json_response({"capabilities": entries})


async def get_settings(request):
    return settings_response(request.app["store"].read("settings"))


async def get_cli_policy(request):
    return web.json_response(request.app["cli_settings"].read_policy())


async def save_cli_policy(request):
    payload = await object_body(request)
    return web.json_response(
        request.app["cli_settings"].write_policy(
            payload.get("permissions"), payload.get("revision")
        )
    )


async def get_cli_settings(request):
    doc = request.app["cli_settings"].read_settings()
    revision = doc.get("revision", "")
    return web.json_response(
        doc,
        headers={"ETag": '"' + str(revision) + '"'},
    )


async def save_cli_settings(request):
    payload = await object_body(request)
    patch = payload.get("settings", payload)
    if not isinstance(patch, dict):
        raise ValueError("settings must be an object")
    header = request.headers.get("If-Match")
    revision = payload.get("revision")
    if revision is None and header:
        revision = header.strip('"')
    patch = {
        key: value
        for key, value in patch.items()
        if value != "[redacted]" and key != "revision"
    }
    doc = request.app["cli_settings"].write_settings(patch, revision)
    return web.json_response(
        doc,
        headers={"ETag": '"' + str(doc.get("revision", "")) + '"'},
    )


def settings_response(document):
    revision = document.get("revision", 0)
    settings = {
        key: value for key, value in document.items() if key != "revision"
    }
    return web.json_response(
        {"settings": public_document(settings), "revision": revision},
        headers={"ETag": '"' + str(revision) + '"'},
    )


async def save_settings(request):
    payload = await object_body(request)
    patch = payload.get("settings", payload)
    if not isinstance(patch, dict):
        raise ValueError("settings must be an object")
    header = request.headers.get("If-Match")
    if header is None:
        return error("revision_required", "If-Match is required", 428)
    revision = int(header.strip('"'))
    patch = {
        key: value
        for key, value in patch.items()
        if value != "[redacted]" and key != "revision"
    }
    current = request.app["store"].read("settings")
    merged = merge_document(current, patch)
    cli_owned = (
        "permissions",
        "allow_commands",
        "allowNonWorkspaceAccess",
        "allow_write",
        "allow_web",
        "allow_subagent",
        "allow_schedule",
        "safe_mode",
        "autopilot",
        "disabledSkills",
        "disabledPlugins",
        "mcpServers",
    )
    if any(merged.get(key) != current.get(key) for key in cli_owned):
        return error(
            "cli_owned_settings",
            "CLI permission/customization changes belong to agy in Termux; "
            "not saved",
            400,
        )
    document = request.app["store"].update("settings", patch, revision)
    return settings_response(document)


def available_storage_roots():
    roots = [Path.home()]
    internal = Path("/storage/emulated/0")
    if internal.is_dir():
        roots.append(internal)
    sdcard = Path("/sdcard")
    if sdcard.is_dir() and sdcard.resolve() not in [r.resolve() for r in roots]:
        roots.append(sdcard)
    try:
        with open("/proc/mounts", "r") as mounts_file:
            for line in mounts_file:
                parts = line.split()
                if len(parts) >= 2:
                    mount = parts[1]
                    if mount.startswith("/storage/"):
                        sub = mount[len("/storage/"):].split("/")[0]
                        if sub and sub not in ("emulated", "self"):
                            target = Path("/storage/" + sub)
                            if target.is_dir() and target not in roots:
                                roots.append(target)
    except Exception:
        pass
    return roots


def available_storage_items():
    items = [
        {"name": "تيرماكس", "path": str(Path.home()), "icon": "🏠", "id": "termux"},
    ]
    internal = Path("/storage/emulated/0")
    if internal.is_dir():
        items.append({"name": "الذاكرة الداخلية", "path": str(internal), "icon": "📱", "id": "internal"})
        downloads = internal / "Download"
        if downloads.is_dir():
            items.append({"name": "التنزيلات", "path": str(downloads), "icon": "📥", "id": "downloads"})
    try:
        with open("/proc/mounts", "r") as mounts_file:
            for line in mounts_file:
                parts = line.split()
                if len(parts) >= 2:
                    mount = parts[1]
                    if mount.startswith("/storage/"):
                        sub = mount[len("/storage/"):].split("/")[0]
                        if sub and sub not in ("emulated", "self"):
                            target = Path("/storage/" + sub)
                            if target.is_dir() and not any(it["path"] == str(target) for it in items):
                                items.append({"name": f"كارت الميموري ({sub})", "path": str(target), "icon": "💾", "id": "sdcard"})
    except Exception:
        pass
    return items


def workspaces(request):
    settings = request.app["store"].read("settings")
    roots = settings.get(
        "workspace_roots", settings.get("trustedWorkspaces", [])
    )
    if not isinstance(roots, list):
        raise ValueError("Workspace roots must be a list")
    combined = list(roots)
    cwd = settings.get("cwd")
    if cwd and Path(cwd).is_dir() and cwd not in combined:
        combined.append(cwd)
    for storage_root in available_storage_roots():
        str_root = str(storage_root)
        if str_root not in combined:
            combined.append(str_root)
    return WorkspacePaths(combined or [Path.home()])


async def list_sessions(request):
    sessions_obj = request.app["sessions"]
    runs = sessions_obj.runs
    result = []
    for s in sessions_obj.sessions.values():
        s_dict = dict(s)
        s_runs = s.get("runs", [])
        if not s_runs:
            continue
        first_run = runs.get(s_runs[0]) if s_runs else None
        last_run = runs.get(s_runs[-1]) if s_runs else None

        title = ""
        if first_run and first_run.get("message"):
            msg = first_run["message"]
            if "<USER_REQUEST>" in msg:
                msg = msg.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
            clean = re.sub(r"<[^>]+>", " ", msg).strip()
            clean = re.sub(r"^(?:/[a-zA-Z0-9_\.\-]+(?:\s*))+", "", clean).strip()
            for line in clean.split("\n"):
                line = line.strip()
                if line and not line.startswith("/"):
                    title = line[:60]
                    break
            if not title:
                raw_first = first_run["message"].split("\n")[0].strip()
                if raw_first.startswith("/"):
                    cmd = raw_first.split()[0].lstrip("/")
                    title = f"أمر: {cmd}"
                else:
                    title = raw_first[:60]

        created_at = (first_run.get("created_at") or 0) if first_run else 0
        mtime = (
            (last_run.get("completed_at") or last_run.get("created_at") or created_at)
            if last_run
            else created_at
        )

        s_dict["title"] = title or "محادثة سابقة"
        s_dict["created_at"] = created_at
        s_dict["mtime"] = mtime
        s_dict["steps"] = len(s_runs) * 2
        result.append(s_dict)
    return web.json_response({"sessions": result})


async def create_session(request):
    if request.app["cli_admin"].updating:
        raise RunConflict("CLI update is in progress")
    payload = await object_body(request)
    options = {
        key: payload[key]
        for key in (
            "model",
            "agent",
            "effort",
            "mode",
            "sandbox",
            "project",
        )
        if key in payload
    }
    has_ap = "autopilot" in payload
    has_sm = "safe_mode" in payload
    if has_ap and has_sm:
        val_ap = payload["autopilot"]
        val_sm = payload["safe_mode"]
        if not isinstance(val_ap, bool) or not isinstance(val_sm, bool):
            raise ValueError("autopilot and safe_mode must be boolean")
        if val_ap == val_sm:
            raise ValueError("Contradictory autopilot and safe_mode settings")
        options["autopilot"] = val_ap
        options["safe_mode"] = val_sm
    elif has_ap:
        val_ap = payload["autopilot"]
        if not isinstance(val_ap, bool):
            raise ValueError("autopilot must be boolean")
        options["autopilot"] = val_ap
        options["safe_mode"] = not val_ap
    elif has_sm:
        val_sm = payload["safe_mode"]
        if not isinstance(val_sm, bool):
            raise ValueError("safe_mode must be boolean")
        options["safe_mode"] = val_sm
        options["autopilot"] = not val_sm
    else:
        st = request.app["cli_settings"].read_settings()
        is_safe = bool(st.get("safe_mode", True))
        options["safe_mode"] = is_safe
        options["autopilot"] = not is_safe

    for key, value in options.items():
        if key in ("sandbox", "autopilot", "safe_mode"):
            if not isinstance(value, bool):
                raise ValueError(f"{key} must be boolean")
        elif not isinstance(value, str):
            raise ValueError("CLI options must be strings")
    if payload.get("conversation_id"):
        await asyncio.to_thread(
            request.app["legacy"].transcript_path, payload["conversation_id"]
        )
        options["conversation_id"] = payload["conversation_id"]
    options["cwd"] = str(
        workspaces(request).resolve(payload.get("cwd", str(Path.home())))
    )
    if not Path(options["cwd"]).is_dir():
        raise ValueError("cwd must be a directory")
    return web.json_response(
        request.app["sessions"].create(options), status=201
    )


async def session_detail(request):
    return web.json_response(
        request.app["sessions"].detail(request.match_info["session_id"])
    )


async def close_session(request):
    session_id = request.match_info["session_id"]
    await request.app["sessions"].close_session(session_id)
    return web.json_response({"session_id": session_id, "state": "idle"})


async def start_run(request):
    payload = await object_body(request)
    if request.app["cli_admin"].updating:
        raise RunConflict("CLI update is in progress")
    session_id = request.match_info["session_id"]
    if any(
        entry["session_id"] == session_id
        and entry["mode"] == "queued"
        and entry["state"] == "pending"
        for entry in request.app["local_tasks"].entries.values()
    ):
        raise RunConflict(
            "Saved messages are waiting; use the next-turn queue"
        )
    run_id = request.app["sessions"].start(session_id, payload)
    return web.json_response({"run_id": run_id}, status=202)


async def run_detail(request):
    sessions = request.app["sessions"]
    run_id = request.match_info["run_id"]
    return web.json_response(
        dict(
            sessions.runs[run_id], last_event_id=sessions.log(run_id).sequence
        )
    )


async def cancel_run(request):
    return web.json_response(
        await request.app["sessions"].cancel(request.match_info["run_id"])
    )


async def handle_permission(request):
    payload = await object_body(request)
    key = str(payload.get("key", "n")).lower()
    run_id = payload.get("run_id")
    sessions = request.app["sessions"]
    resolved = sessions.resolve_permission(key, run_id)
    return web.json_response({"status": "ok", "key": key, "resolved": resolved})


async def stream_events(request):
    run_id = request.match_info["run_id"]
    sessions = request.app["sessions"]
    run = sessions.runs[run_id]
    log = sessions.log(run_id)
    cursor = int(
        request.headers.get("Last-Event-ID", request.query.get("after", "0"))
    )
    if cursor < 0 or cursor > log.sequence:
        raise ValueError("Invalid event cursor")
    replay = log.after(cursor)
    response = web.StreamResponse(
        headers={
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        }
    )
    await response.prepare(request)
    try:
        if replay is None:
            await send_event(
                response,
                {
                    "id": log.sequence,
                    "event": "replay_unavailable",
                    "data": {"run_id": run_id, "state": run["state"]},
                },
            )
            return response
        while True:
            log.changed.clear()
            for event in log.after(cursor) or []:
                await send_event(response, event)
                cursor = event["id"]
            if run["state"] in TERMINAL:
                break
            try:
                await asyncio.wait_for(log.changed.wait(), 15)
            except asyncio.TimeoutError:
                await response.write(b": heartbeat\n\n")
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    return response


async def send_event(response, event):
    payload = json.dumps(event["data"], ensure_ascii=False)
    await response.write(
        (
            f"id: {event['id']}\nevent: {event['event']}\n"
            f"data: {payload}\n\n"
        ).encode()
    )


BRAIN_DIR = Path.home() / ".gemini" / "antigravity-cli" / "brain"


async def list_artifacts(request):
    cid = request.query.get("conversation_id", "")
    if not cid:
        sessions = request.app.get("sessions")
        if sessions:
            for sess in sessions.sessions.values():
                if sess.get("conversation_id"):
                    cid = sess["conversation_id"]
                    break
    if not cid and BRAIN_DIR.is_dir():
        try:
            subdirs = [d for d in BRAIN_DIR.iterdir() if d.is_dir()]
            if subdirs:
                subdirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
                cid = subdirs[0].name
        except Exception:
            pass
    artifacts = []
    if cid and BRAIN_DIR.is_dir():
        if cid in (".", "..") or "/" in cid or "\\" in cid:
            return error("invalid_request", "Invalid conversation ID", 400)
        clean_cid = Path(cid).name
        if clean_cid in (".", ".."):
            return error("invalid_request", "Invalid conversation ID", 400)
        target_dir = (BRAIN_DIR / clean_cid).resolve()
        if target_dir.is_dir() and BRAIN_DIR.resolve() in target_dir.parents:
            for fname in target_dir.iterdir():
                if fname.name.endswith(".metadata.json"):
                    fname_res = fname.resolve()
                    if BRAIN_DIR.resolve() not in fname_res.parents or not fname_res.is_file():
                        continue
                    base_name = fname.name[:-14]
                    if base_name in (".", "..") or "/" in base_name or "\\" in base_name:
                        continue
                    doc_path = (target_dir / base_name).resolve()
                    if BRAIN_DIR.resolve() not in doc_path.parents or not doc_path.is_file():
                        continue
                    mdata = {}
                    try:
                        mdata = json.loads(
                            fname_res.read_text(encoding="utf-8", errors="ignore")
                        )
                    except Exception:
                        pass
                    st = doc_path.stat()
                    artifacts.append({
                        "name": base_name,
                        "conversation_id": clean_cid,
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
            artifacts.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return web.json_response({
        "status": "ok",
        "conversation_id": cid,
        "artifacts": artifacts,
    })


async def read_artifact(request):
    cid = request.query.get("conversation_id", "").strip().strip('"').strip("'")
    name = request.query.get("name", "").strip().strip('"').strip("'")
    req_path = request.query.get("path", "").strip().strip('"').strip("'")

    # 1. If direct path is provided, validate it resides within BRAIN_DIR
    if req_path:
        try:
            resolved_p = Path(req_path).resolve()
            if BRAIN_DIR.resolve() in resolved_p.parents and resolved_p.is_file():
                content = resolved_p.read_text(encoding="utf-8", errors="ignore")
                return web.json_response({
                    "status": "ok",
                    "conversation_id": resolved_p.parent.name,
                    "name": resolved_p.name,
                    "path": str(resolved_p),
                    "content": content,
                })
        except Exception:
            pass

    if not name and req_path:
        name = Path(req_path).name.strip().strip('"').strip("'")

    if not name:
        return error("invalid_request", "Missing artifact name or path", 400)

    if name in (".", "..") or "/" in name or "\\" in name:
        return error("invalid_request", "Invalid artifact name", 400)

    clean_name = Path(name).name.strip().strip('"').strip("'")
    if clean_name in (".", "..") or not clean_name:
        return error("invalid_request", "Invalid artifact name", 400)

    # 2. If cid is missing, check active sessions
    if not cid:
        sessions = request.app.get("sessions")
        if sessions:
            for sess in sessions.sessions.values():
                c = sess.get("conversation_id")
                if c and c not in (".", "..") and "/" not in c and "\\" not in c:
                    cand = (BRAIN_DIR / Path(c).name / clean_name).resolve()
                    if BRAIN_DIR.resolve() in cand.parents and cand.is_file():
                        cid = c
                        break

    # 3. If still missing cid, find which conversation in BRAIN_DIR has this artifact
    if not cid and BRAIN_DIR.is_dir():
        try:
            for d in sorted(BRAIN_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if d.is_dir() and not d.name.startswith("."):
                    candidate = (d / clean_name).resolve()
                    if BRAIN_DIR.resolve() in candidate.parents and candidate.is_file():
                        cid = d.name
                        break
        except Exception:
            pass

    if not cid:
        return error("not_found", f"Artifact {clean_name} not found in any conversation", 404)

    if cid in (".", "..") or "/" in cid or "\\" in cid:
        return error("invalid_request", "Invalid conversation ID", 400)

    clean_cid = Path(cid).name
    if clean_cid in (".", "..") or not clean_cid:
        return error("invalid_request", "Invalid conversation ID", 400)

    doc_path = (BRAIN_DIR / clean_cid / clean_name).resolve()
    if not (BRAIN_DIR.resolve() in doc_path.parents and doc_path.is_file()):
        return error("not_found", f"Artifact {clean_name} not found", 404)

    content = doc_path.read_text(encoding="utf-8", errors="ignore")
    return web.json_response({
        "status": "ok",
        "conversation_id": clean_cid,
        "name": clean_name,
        "path": str(doc_path),
        "content": content,
    })


async def list_files(request):
    path = api_path(request, request.query.get("path", str(Path.home())))
    entries = []
    try:
        children = sorted(
            path.iterdir(), key=lambda entry: entry.name.casefold()
        )
    except (PermissionError, FileNotFoundError, OSError):
        children = []
    for child in children:
        try:
            resolved = api_path(request, str(child))
            stat = resolved.stat()
        except (PermissionError, FileNotFoundError, OSError):
            continue
        entries.append(
            {
                "name": child.name,
                "path": str(child),
                "is_dir": child.is_dir(),
                "size": stat.st_size,
            }
        )
        if len(entries) >= 1000:
            break
    return web.json_response(
        {"path": str(path), "entries": entries, "storages": available_storage_items()}
    )


async def read_file(request):
    path = api_path(request, request.query["path"])
    if path.stat().st_size > 1024 * 1024:
        return error("file_too_large", "File exceeds the 1 MiB limit", 413)
    try:
        content = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        return error("binary_file", "File is binary and cannot be displayed as text", 415)
    return web.json_response(
        {"path": str(path), "content": content}
    )


async def create_directory(request):
    path = api_path(request, (await object_body(request))["path"])
    path.mkdir()
    return web.json_response({"path": str(path)}, status=201)


DEFAULT_MODELS_CATALOG = [
    {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"},
    {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)"},
    {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low)"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6 (Thinking)"},
    {"id": "claude-opus-4-6-thinking", "name": "Claude Opus 4.6 (Thinking)"},
    {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)"},
]


def invalidate_catalog_cache(app, kind=None):
    cache = app.get("catalog_cache")
    if not cache:
        return
    if kind == "skills":
        for k in list(cache.keys()):
            if k[0] in ("skills", "commands"):
                cache.pop(k, None)
    elif kind == "plugins":
        for k in list(cache.keys()):
            if k[0] in ("plugins", "skills", "commands", "rules"):
                cache.pop(k, None)
    elif kind == "mcp":
        for k in list(cache.keys()):
            if k[0] in ("mcp", "commands"):
                cache.pop(k, None)
    elif kind:
        for k in list(cache.keys()):
            if k[0] == kind:
                cache.pop(k, None)
    else:
        cache.clear()


async def list_cli(request):
    kind = request.path.rsplit("/", 1)[-1]
    cwd = request.query.get("cwd")
    if cwd is not None:
        cwd = api_path(request, cwd)
    if kind == "mcp":
        return web.json_response(
            {
                "servers": request.app["mcp_settings"].listing(
                    trusted_cli_cwd(request, dict(request.query))
                )
            }
        )

    cache = request.app.get("catalog_cache")
    if cache is None:
        cache = request.app["catalog_cache"] = {}
    cache_key = (kind, str(cwd) if cwd else None)
    now = time.time()
    force_refresh = request.query.get("refresh") == "1"

    if not force_refresh and cache_key in cache:
        cached_data, cached_at = cache[cache_key]
        if (now - cached_at) < 300:
            return web.json_response(
                {"servers" if kind == "mcp" else kind: redact(cached_data)}
            )

    try:
        entries = (
            await request.app["cli"].listing(kind, cwd)
            if cwd
            else (await request.app["cli"].listing(kind))
        )
    except Exception as exc:
        if cache_key in cache:
            entries = cache[cache_key][0]
        elif kind == "models":
            entries = list(DEFAULT_MODELS_CATALOG)
        else:
            raise exc

    if entries:
        cache[cache_key] = (entries, now)

    return web.json_response(
        {"servers" if kind == "mcp" else kind: redact(entries)}
    )


async def add_mcp(request):
    payload = await object_body(request)
    cwd = trusted_cli_cwd(request, payload)
    await request.app["cli"].mutate_mcp("add", payload, cwd=cwd)
    invalidate_catalog_cache(request.app, "mcp")
    return web.json_response(
        {"servers": request.app["mcp_settings"].listing(cwd)}
    )


async def change_mcp(request):
    payload = await object_body(request)
    servers = request.app["mcp_settings"].change_server(
        request.match_info["name"],
        trusted_cli_cwd(request, payload),
        request.match_info["action"],
        payload.get("revision"),
    )
    invalidate_catalog_cache(request.app, "mcp")
    return web.json_response({"servers": servers})


async def delete_mcp(request):
    payload = await object_body(request)
    servers = request.app["mcp_settings"].change_server(
        request.match_info["name"],
        trusted_cli_cwd(request, payload),
        "delete",
        payload.get("revision"),
    )
    invalidate_catalog_cache(request.app, "mcp")
    return web.json_response({"servers": servers})


async def local_usage(request):
    return web.json_response(system_usage(request.app["store"].root))


async def account_quota(request):
    return web.json_response(
        await request.app["cli_admin"].quota(
            refresh=request.query.get("refresh") == "1"
        )
    )


async def cli_version(request):
    return web.json_response(
        {
            "version": await request.app["cli_admin"].version(),
            "source": "agy_help",
        }
    )


async def system_versions(request):
    try:
        version = await request.app["cli_admin"].version()
    except CLIUnavailable:
        version = None
    document = json.loads(
        Path(__file__).with_name("version.json").read_text(encoding="utf-8")
    )
    return web.json_response(
        {
            "server": {
                "version": document["version_name"],
                "version_code": document["version_code"],
                "source": "server_version_json",
            },
            "cli": {"version": version, "source": "agy_help"},
            "apk": {"version": None, "source": "native_get_app_version"},
        }
    )


async def cli_update(request):
    payload = await object_body(request)
    sessions = request.app["sessions"]

    def can_update():
        return (
            not any(
                run["state"] == "running"
                for run in request.app["voice_agent"].runs.values()
            )
            and not any(
                run["state"] == "running" for run in sessions.runs.values()
            )
            and not any(
                process.returncode is None
                for process in sessions.processes.values()
            )
        )

    return web.json_response(
        await request.app["cli_admin"].update(
            payload.get("request_id"), can_update
        )
    )


async def doctor_status(request):
    return web.json_response(
        {
            "checks": [
                {
                    "name": "agy_executable",
                    "available": request.app["cli"].available,
                },
                {
                    "name": "android_credentials",
                    "configured": request.app["android"].available,
                },
            ],
            "authentication": (
                "unknown; configuration is not a live login check"
            ),
        }
    )


async def change_catalog(request):
    kind = (
        "plugins" if request.path.startswith("/api/v1/plugins/") else "skills"
    )
    payload = await object_body(request)
    cwd = payload.get("cwd")
    if cwd is not None:
        cwd = api_path(request, cwd)
    arguments = (
        kind,
        request.match_info["action"],
        request.match_info["name"],
    )
    entries = (
        await request.app["cli"].mutate_catalog(*arguments, cwd=cwd)
        if cwd
        else await request.app["cli"].mutate_catalog(*arguments)
    )
    invalidate_catalog_cache(request.app, kind)
    return web.json_response({kind: redact(entries)})


async def device_epoch(request):
    return web.json_response(await request.app["android"].journal_identity())


async def device_action(request):
    return web.json_response(
        await request.app["android"].execute(await object_body(request))
    )


async def legacy_api(request):
    return error(
        "upgrade_required",
        "This client requires API v1 and browser pairing",
        426,
    )


async def object_body(request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise ValueError("JSON body must be an object")
    return payload


async def shutdown_server(request):
    callback = request.app["shutdown_callback"]
    if callback is None:
        return error("shutdown_unavailable", "Host owns server shutdown", 503)
    if not request.app["shutdown_requested"]:
        request.app["shutdown_requested"] = True
        asyncio.get_running_loop().call_later(0.05, callback)
    return web.json_response({"status": "stopping"}, status=202)


async def start_page(request):
    return web.FileResponse(
        Path(__file__).resolve().parent / "web" / "start.html"
    )


async def index(request):
    cookie, csrf = request.app["pairing"].new_session()
    response = web.FileResponse(
        Path(__file__).resolve().parent / "web" / "index.html"
    )
    response.set_cookie(
        COOKIE,
        cookie,
        httponly=True,
        samesite="Lax",
        max_age=86400 * 365,
        path="/",
    )
    return response


async def static_file(request):
    root = Path(__file__).resolve().parent / "web"
    return web.FileResponse(root / request.path.lstrip("/"))


async def response_headers(request, response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' https://appassets.androidplatform.net; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://appassets.androidplatform.net; "
        "style-src 'self' 'unsafe-inline' https://appassets.androidplatform.net; "
        "img-src 'self' data: https://appassets.androidplatform.net; "
        "connect-src 'self' http://127.0.0.1:* http://localhost:* https://appassets.androidplatform.net; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    origin = request.headers.get("Origin")
    if origin == "https://appassets.androidplatform.net" or origin == "null":
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-CSRF-Token, Authorization, If-Match"
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif "Cache-Control" not in response.headers:
        response.headers["Cache-Control"] = "no-cache, must-revalidate"


async def list_legacy(request):
    return web.json_response(
        {
            "conversations": await asyncio.to_thread(
                request.app["legacy"].listing
            )
        }
    )


async def read_legacy(request):
    transcript = await asyncio.to_thread(
        request.app["legacy"].transcript, request.match_info["conversation_id"]
    )
    transcript["records"] = redact(transcript["records"])
    return web.json_response(transcript)


def instance_identity(store):
    document = store.read("instance")
    if not isinstance(document, dict):
        raise ValueError("Stored instance must be an object")
    if "instance_id" not in document:
        document["instance_id"] = secrets.token_hex(32)
        store.write("instance", document)
    identity = document["instance_id"]
    if (
        not isinstance(identity, str)
        or not 16 <= len(identity) <= 128
        or not identity.isascii()
        or any(ord(char) < 33 for char in identity)
    ):
        raise ValueError("Invalid stored instance identity")
    return identity


def api_path(request, requested):
    path = workspaces(request).resolve(requested)
    if path.name in (
        "antigravity-oauth-token",
        ".companion-oauth-token",
        "antigravity-release-key.jks",
        "instance.json",
        "release-cert.der",
    ):
        raise PermissionError("Sensitive secret file is protected")
    if path.parent.name == ".agents" and path.name.startswith(
        ("mcp_config.json", ".companion-oauth-")
    ):
        raise PermissionError("Private MCP configuration is outside file API")
    home = request.app["legacy"].root.parents[2]
    scratch_root = (home / ".gemini" / "antigravity-cli" / "scratch").resolve()
    if path == scratch_root or scratch_root in path.parents:
        return path
    private_roots = (
        request.app["store"].root,
        home / ".gemini",
        home / ".agy",
        home / ".config" / "agy",
    )
    for private in private_roots:
        reserved = private.resolve()
        if path == reserved or reserved in path.parents:
            raise PermissionError("Private configuration is outside file API")
    return path
