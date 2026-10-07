#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Persistent AI Session & SSE Stream Engine
# ==============================================================================

import os
import sys
import time
import json
import re
import socket
import signal
import threading
import subprocess
import queue

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import shared
from shared import (
    HOME_DIR, ai_process_lock, ai_stats_lock, latest_ai_stats,
    subagent_lock, active_tasks_registry, register_live_subagent,
    send_json_response, logger
)
from security import (
    TOOL_TO_CATEGORY, is_category_allowed, format_human_permission_question,
    send_system_broadcast, permission_event, permission_question,
    permission_response, session_approved_tools
)
from models import resolve_model_id, is_effort_supported_for_model
from settings_manager import load_settings, save_settings

active_ai_process = None

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
        self.mode = "accept-edits"
        self.sandbox = False

    def get_or_create(self, conversation_id, model, effort, cwd, force_new=False, mode=None, sandbox=False):
        with self.lock:
            if force_new:
                self._terminate_locked()
            elif self.proc and self.proc.poll() is None:
                match_conv = (not conversation_id) or (self.conversation_id == conversation_id)
                match_model = (not model) or (self.model == model)
                match_effort = (not effort) or (self.effort == effort)
                target_mode = mode if mode in ["accept-edits", "plan"] else self.mode
                match_mode = (mode is None) or (self.mode == target_mode)
                match_sandbox = (self.sandbox == bool(sandbox))
                if match_conv and match_model and match_effort and match_mode and match_sandbox:
                    return self.proc, self.line_queue, False
                self._terminate_locked()

            cmd = ["agy", "--input-format", "stream-json", "--output-format", "stream-json", "--dangerously-skip-permissions"]
            if model:
                cmd.extend(["--model", model])
            if effort and is_effort_supported_for_model(model):
                cmd.extend(["--effort", effort])
            if mode and mode in ["accept-edits", "plan"]:
                cmd.extend(["--mode", mode])
            if sandbox:
                cmd.append("--sandbox")
            if conversation_id:
                cmd.extend(["--conversation", conversation_id])

            env = dict(os.environ)
            env["GOMAXPROCS"] = "2"
            env["AGY_NO_UPDATE_CHECK"] = "1"
            env["GODEBUG"] = "netdns=cgo"
            env["SSL_CERT_FILE"] = "/data/data/com.termux/files/usr/etc/tls/cert.pem"
            env["LANG"] = "en_US.UTF-8"
            env["LC_ALL"] = "en_US.UTF-8"
            env.pop("LD_PRELOAD", None)
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
            self.mode = mode if mode in ["accept-edits", "plan"] else "accept-edits"
            self.sandbox = bool(sandbox)
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
            self.mode = "accept-edits"
            self.sandbox = False

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
    mode = req_data.get("mode") or settings.get("mode", "accept-edits")
    sandbox = req_data.get("sandbox") if "sandbox" in req_data else settings.get("sandbox", False)

    # Coordinated model & reasoning effort handling
    m_eff = re.search(r'-(low|medium|high|max)$', selected_model)
    eff_to_pass = ""
    if m_eff:
        if effort in ["low", "medium", "high", "max"]:
            base_model = selected_model[:m_eff.start()]
            selected_model = f"{base_model}-{effort}"
    else:
        if effort in ["low", "medium", "high", "max"] and is_effort_supported_for_model(selected_model):
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
            force_new=force_new,
            mode=mode,
            sandbox=sandbox
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
                force_new=force_new,
                mode=mode,
                sandbox=sandbox
            )
            with ai_process_lock:
                active_ai_process = proc
                shared.active_ai_process = proc
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

