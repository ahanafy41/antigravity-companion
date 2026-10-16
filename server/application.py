"""Versioned local HTTP API with independent CLI and Android state."""

import asyncio
import json
import hashlib
import hmac
import re
import secrets
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
    application.on_startup.append(start_local_tasks)
    application.on_cleanup.append(close_app)
    application.on_response_prepare.append(response_headers)
    register_routes(application)
    return application


async def start_local_tasks(application):
    await application["local_tasks"].start()


async def close_app(application):
    await application["local_tasks"].close()
    await application["voice_agent"].close()
    await application["sessions"].close()


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
        web.get("/api/v1/sessions", list_sessions),
        web.post("/api/v1/sessions", create_session),
        web.get("/api/v1/sessions/{session_id}", session_detail),
        web.post("/api/v1/sessions/{session_id}/close", close_session),
        web.post("/api/v1/sessions/{session_id}/runs", start_run),
        web.get("/api/v1/runs/{run_id}", run_detail),
        web.post("/api/v1/runs/{run_id}/cancel", cancel_run),
        web.get("/api/v1/runs/{run_id}/events", stream_events),
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
        return error(
            "pairing_failed", "Pairing code is invalid or expired", 401
        )
    cookie, csrf = paired
    response = web.json_response({"csrf_token": csrf})
    response.set_cookie(
        COOKIE,
        cookie,
        httponly=True,
        samesite="Strict",
        max_age=86400,
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
        samesite="Strict",
        max_age=86400,
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
        max_age=86400,
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


def workspaces(request):
    settings = request.app["store"].read("settings")
    roots = settings.get(
        "workspace_roots", settings.get("trustedWorkspaces", [])
    )
    if not isinstance(roots, list):
        raise ValueError("Workspace roots must be a list")
    return WorkspacePaths(roots or [Path.home()])


async def list_sessions(request):
    return web.json_response(
        {"sessions": list(request.app["sessions"].sessions.values())}
    )


async def create_session(request):
    if request.app["cli_admin"].updating:
        raise RunConflict("CLI update is in progress")
    payload = await object_body(request)
    options = {
        key: payload[key]
        for key in ("model", "agent", "effort", "mode", "sandbox", "project")
        if key in payload
    }
    for key, value in options.items():
        if key == "sandbox":
            if not isinstance(value, bool):
                raise ValueError("sandbox must be boolean")
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


async def list_files(request):
    path = api_path(request, request.query.get("path", str(Path.home())))
    entries = []
    for child in sorted(
        path.iterdir(), key=lambda entry: entry.name.casefold()
    ):
        try:
            resolved = api_path(request, str(child))
            stat = resolved.stat()
        except (PermissionError, FileNotFoundError):
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
    return web.json_response({"path": str(path), "entries": entries})


async def read_file(request):
    path = api_path(request, request.query["path"])
    if path.stat().st_size > 1024 * 1024:
        return error("file_too_large", "File exceeds the 1 MiB limit", 413)
    return web.json_response(
        {"path": str(path), "content": path.read_text(encoding="utf-8-sig")}
    )


async def create_directory(request):
    path = api_path(request, (await object_body(request))["path"])
    path.mkdir()
    return web.json_response({"path": str(path)}, status=201)


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
    entries = (
        await request.app["cli"].listing(kind, cwd)
        if cwd
        else (await request.app["cli"].listing(kind))
    )
    return web.json_response(
        {"servers" if kind == "mcp" else kind: redact(entries)}
    )


async def add_mcp(request):
    payload = await object_body(request)
    cwd = trusted_cli_cwd(request, payload)
    await request.app["cli"].mutate_mcp("add", payload, cwd=cwd)
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
    return web.json_response({"servers": servers})


async def delete_mcp(request):
    payload = await object_body(request)
    servers = request.app["mcp_settings"].change_server(
        request.match_info["name"],
        trusted_cli_cwd(request, payload),
        "delete",
        payload.get("revision"),
    )
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
        asyncio.get_running_loop().call_later(0.2, callback)
    return web.json_response({"status": "stopping"}, status=202)


async def start_page(request):
    return web.FileResponse(
        Path(__file__).resolve().parent / "web" / "start.html"
    )


async def index(request):
    return web.FileResponse(
        Path(__file__).resolve().parent / "web" / "index.html"
    )


async def static_file(request):
    root = Path(__file__).resolve().parent / "web"
    return web.FileResponse(root / request.path.lstrip("/"))


async def response_headers(request, response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'self'; object-src 'none'; "
        "base-uri 'self'; frame-ancestors 'none'"
    )
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"


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
    if path.parent.name == ".agents" and path.name.startswith(
        ("mcp_config.json", ".companion-oauth-")
    ):
        raise PermissionError("Private MCP configuration is outside file API")
    home = request.app["legacy"].root.parents[2]
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
