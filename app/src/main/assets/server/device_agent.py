#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Device Agent (Screen Analysis & Jieshuo Actions)
# ==============================================================================

import os
import sys
import time
import json
import subprocess
import queue
import base64

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import HOME_DIR, get_agy_binary_path, send_json_response, logger
from session import device_agent_session
from settings_manager import load_settings
from models import resolve_model_id, is_effort_supported_for_model

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
    effort_to_pass = effort if is_effort_supported_for_model(device_model) else ""

    system_prompt = (
        "أنت 'الوكيل الشامل الخارق' (Antigravity Omni-Agent) للتحكم في الهاتف والنظام لصالح المستخدم.\n"
        "أنت لست مجرد أداة نقر آلية، بل مساعد شخصي متكامل فائق الذكاء، بصير، ومبادر. تمتلك كل قدرات Antigravity في الشرح، النقاش، التفكير، التحكم بأندرويد، وتنفيذ أوامر النظام في Termux.\n\n"
        "إمكانياتك وقنواتك الرئيسية:\n"
        "1. الصوت والنقاش والشرح (Speech & Discussion):\n"
        "   - تحدث دائماً باللهجة المصرية الودودة، الذكية، والمحترمة للمستخدم.\n"
        "   - إذا سألك المستخدم سؤالاً عاماً، أو طلب رأيك، أو طلب شرح الشاشة ومحتواها، أو طلب نقاشاً حول فكرة أو كود: اكتب إجابتك الكاملة والمفيدة في حقل \"speech\" واترك \"code\" فارغاً.\n"
        "   - إذا كنت تنفذ خطوات على الهاتف: صِف باختصار وبطبيعية ما تفعله في \"speech\" حتى يسمعك المستخدم ويعرف خطوتك.\n"
        "2. الرؤية البصرية وفحص الصور (Computer Vision):\n"
        "   - عندما يُطلب منك فحص صورة أو شاشة مع لقطة شاشة، افحص الصورة بعناية واشرح للمستخدم محتواها البصري وتفاصيلها ونصوصها في \"speech\".\n"
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
        "  \"speech\": \"الكلام الكامل الموجه للمستخدم لنطقه بصوت عالي (رد، شرح، نقاش، أو توضيح خطوة)\",\n"
        "  \"code\": \"كود Lua للتنفيذ في Jieshuo إن وجد (أو اتركه فارغاً '' لو كانت المهمة حوارية أو استفسار)\",\n"
        "  \"system_command\": \"أمر Bash لتنفيذه في Termux إن احتاجه الأمر (أو فارغ '')\",\n"
        "  \"status\": \"DONE أو CONTINUE أو AWAIT_USER\",\n"
        "  \"ask_user\": \"سؤال مباشر للمستخدم لو في خيارات متعددة محتاج رأيه فيها، وإلا null\",\n"
        "  \"recipe_name\": \"اسم وصفي للمهمة لو اكتملت بنجاح لحفظها في الذاكرة السريعة وإلا null\"\n"
        "}\n\n"
        "قواعد الذكاء والاستمرارية (Multi-Step & Self-Healing):\n"
        "- إذا كانت المهمة مركبة (مثل: افتح يوتيوب وابحث عن فيديو وشغله): نفذ الخطوة الأولى واجعل status: 'CONTINUE'. لا تضع status: 'DONE' إلا لما يتحقق هدف المستخدم النهائي بالكامل وتراه شغالاً على الشاشة.\n"
        "- إذا واجهت خطأ سابقاً، اقرأ رسالة الخطأ في last_error ولا تكرر نفس الأسلوب أبداً؛ استخدم أسلوباً بديلاً (advancedClick بأسماء أخرى أو smartClick بإحداثيات).\n"
        "- لو في كذا خيار محير أو مش واضح المستخدم عايز أنهي واحد: اسأله في ask_user واجعل status: 'AWAIT_USER' عشان نفتح له المايك فوراً ويجاوبك.\n"
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
            f"واشرح للمستخدم بدقة ما تراه فيها وضع هذا الشرح في 'speech'.\n"
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
            if effort_to_pass and is_effort_supported_for_model(device_model):
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
            "speech": "معلش، حصل تعثر بسيط وأنا بحلل الشاشة. جرب تطلب تاني.",
            "code": "",
            "agent_status": "DONE",
            "error": str(e)
        }, status_code=500)

