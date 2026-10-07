#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Authentication & Interactive PTY Manager
# ==============================================================================

import os
import sys
import time
import datetime
import json
import re
import threading
import subprocess
import pty
import select
import termios
import fcntl
import struct
import base64
import errno
import shutil

# Ensure server directory is in sys.path
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import AUTH_TOKEN_FILE, HOME_DIR, get_agy_binary_path, logger

def get_auth_token_info():
    """Extract authenticated identity, validity, and expiry from official token file."""
    if not os.path.exists(AUTH_TOKEN_FILE):
        return {
            "logged_in": False,
            "email": None,
            "expiry": None,
            "is_valid": False,
            "token_present": False
        }
    try:
        with open(AUTH_TOKEN_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        tok = data.get("token", {}) if isinstance(data, dict) else {}
        access_tok = tok.get("access_token", "")
        refresh_tok = tok.get("refresh_token", "")
        expiry_str = tok.get("expiry", "")
        id_token = data.get("id_token", "")

        email = None
        if id_token and "." in id_token:
            parts = id_token.split(".")
            if len(parts) >= 2:
                payload_b64 = parts[1]
                payload_b64 += "=" * (-len(payload_b64) % 4)
                claims = json.loads(base64.b64decode(payload_b64).decode("utf-8", errors="ignore"))
                email = claims.get("email")

        is_valid = False
        if expiry_str:
            try:
                iso_clean = expiry_str.replace("Z", "+00:00")
                exp_ts = datetime.datetime.fromisoformat(iso_clean).timestamp()
                is_valid = bool(access_tok and (exp_ts > time.time() or refresh_tok))
            except Exception:
                is_valid = bool(access_tok)
        else:
            is_valid = bool(access_tok)

        return {
            "logged_in": True,
            "email": email,
            "expiry": expiry_str,
            "is_valid": is_valid,
            "token_present": True,
            "has_refresh": bool(refresh_tok)
        }
    except Exception as e:
        logger.warning("Error reading auth token file: %s", e)
        return {
            "logged_in": False,
            "email": None,
            "expiry": None,
            "is_valid": False,
            "token_present": True,
            "error": str(e)
        }

class InteractivePTYAuthManager:
    """Manages an interactive agy authentication session via a pseudo-terminal (PTY)."""
    def __init__(self):
        self.lock = threading.RLock()
        self.proc = None
        self.master_fd = None
        self.state = "IDLE"  # IDLE, STARTING, WAITING_FOR_CODE, WAITING_FOR_TERMS, SUCCESS, ERROR
        self.auth_url = ""
        self.prompt_message = ""
        self.last_output = ""
        self.error_message = ""
        self.reader_thread = None
        self.start_time = 0

    def _get_state_locked(self):
        if self.proc and self.proc.poll() is not None:
            ret = self.proc.poll()
            if self.state not in ["SUCCESS", "ERROR"]:
                info = get_auth_token_info()
                if info.get("is_valid") or info.get("logged_in"):
                    self.state = "SUCCESS"
                    self.prompt_message = f"تم تسجيل الدخول وتفعيل الترخيص بنجاح بحساب: {info.get('email', '')}"
                elif ret == 0:
                    self.state = "SUCCESS"
                    self.prompt_message = "اكتملت المصادقة بنجاح!"
                else:
                    self.state = "ERROR"
                    self.error_message = f"انتهت عملية المصادقة برمز خروج: {ret}"
        return {
            "state": self.state,
            "auth_url": self.auth_url,
            "prompt_message": self.prompt_message,
            "error_message": self.error_message,
            "is_running": bool(self.proc and self.proc.poll() is None)
        }

    def get_state(self):
        with self.lock:
            return self._get_state_locked()

    def start_login(self, force=False):
        with self.lock:
            if self.proc and self.proc.poll() is None:
                if not force:
                    return {"status": "already_running", "wizard": self._get_state_locked()}
                self._terminate_locked()

            self.state = "STARTING"
            self.auth_url = ""
            self.prompt_message = "جاري تهيئة جلسة تسجيل الدخول التفاعلية..."
            self.last_output = ""
            self.error_message = ""
            self.start_time = time.time()

            if os.path.exists(AUTH_TOKEN_FILE):
                try:
                    shutil.copy2(AUTH_TOKEN_FILE, AUTH_TOKEN_FILE + ".bak")
                    os.remove(AUTH_TOKEN_FILE)
                except Exception as e:
                    logger.warning("Could not backup token before login: %s", e)

            cmd = [get_agy_binary_path()]

            env = dict(os.environ)
            env["GOMAXPROCS"] = "2"
            env["AGY_NO_UPDATE_CHECK"] = "1"
            env["AGY_AUTO_UPDATE"] = "0"
            env["GODEBUG"] = "netdns=cgo"
            env["SSL_CERT_FILE"] = "/data/data/com.termux/files/usr/etc/tls/cert.pem"
            env["LANG"] = "en_US.UTF-8"
            env["LC_ALL"] = "en_US.UTF-8"
            env.pop("LD_PRELOAD", None)
            browser_bin = "/data/data/com.termux/files/usr/bin/termux-open-url"
            if os.path.exists(browser_bin):
                env["BROWSER"] = browser_bin
            env["PATH"] = "/data/data/com.termux/files/usr/bin:" + env.get("PATH", "")

            try:
                master_fd, slave_fd = pty.openpty()
                winsize = struct.pack("HHHH", 24, 80, 0, 0)
                fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                self.state = "ERROR"
                self.error_message = f"فشل تخصيص الطرفية الوهمية (PTY): {e}"
                logger.error("Failed to allocate PTY: %s", e)
                return {"status": "error", "message": str(e)}

            def preexec():
                os.login_tty(slave_fd)

            try:
                self.proc = subprocess.Popen(
                    cmd,
                    preexec_fn=preexec,
                    cwd=HOME_DIR,
                    env=env
                )
                os.close(slave_fd)
                self.master_fd = master_fd
            except Exception as e:
                os.close(master_fd)
                os.close(slave_fd)
                self.state = "ERROR"
                self.error_message = f"فشل تشغيل عملية المصادقة: {e}"
                logger.error("Failed to spawn auth process: %s", e)
                return {"status": "error", "message": str(e)}

            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True, name="PTYAuthReader")
            self.reader_thread.start()
            return {"status": "started", "wizard": self._get_state_locked()}

    def _reader_loop(self):
        url_regex = re.compile(r'https?://[^\s<>"\x1b]+')
        clean_ansi_regex = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')

        while True:
            with self.lock:
                if not self.proc or self.master_fd is None:
                    break
                m_fd = self.master_fd

            try:
                r, _, _ = select.select([m_fd], [], [], 0.5)

                info = get_auth_token_info()
                if info.get("logged_in") and info.get("is_valid"):
                    with self.lock:
                        self.state = "SUCCESS"
                        self.prompt_message = f"تم تسجيل الدخول وتفعيل الترخيص بنجاح بحساب: {info.get('email', '')}"
                    break

                if not r:
                    with self.lock:
                        if self.proc and self.proc.poll() is not None:
                            break
                    continue

                chunk = os.read(m_fd, 1024)
                if not chunk:
                    break

                text = clean_ansi_regex.sub('', chunk.decode("utf-8", errors="ignore"))
                with self.lock:
                    self.last_output += text
                    urls = url_regex.findall(self.last_output)
                    for u in urls:
                        clean_u = u.rstrip('.,);\'"')
                        if "google.com" in clean_u or "authorize" in clean_u:
                            self.auth_url = clean_u
                            if self.state in ["STARTING", "IDLE"]:
                                self.state = "WAITING_FOR_CODE"
                                self.prompt_message = "يرجى فتح رابط تسجيل الدخول، ثم نسخ كود المصادقة ولصقه هنا."

                    if any(p in self.last_output for p in ["paste the authorization code", "Enter authorization code", "authorization code below"]):
                        if self.state in ["STARTING", "WAITING_FOR_CODE", "IDLE"]:
                            self.state = "WAITING_FOR_CODE"
                            self.prompt_message = "أدخل كود المصادقة المستلم من جوجل واضغط على زر التأكيد."

                    if any(p.lower() in self.last_output.lower() for p in ["terms of service", "accept the terms", "license agreement", "do you accept"]):
                        self.state = "WAITING_FOR_TERMS"
                        self.prompt_message = "مطلوب الموافقة على شروط خدمة واتفاقية ترخيص Antigravity."

                    if any(p in self.last_output for p in ["Successfully authenticated", "Quota project set", "Authenticated as"]):
                        self.state = "SUCCESS"
                        self.prompt_message = "تم تسجيل الدخول وتفعيل الترخيص بنجاح!"

            except OSError as err:
                if err.errno == errno.EIO:
                    break
                elif err.errno in [errno.EAGAIN, errno.EWOULDBLOCK]:
                    continue
                else:
                    logger.warning("PTY read error: %s", err)
                    break
            except Exception as ex:
                logger.warning("PTY reader loop exception: %s", ex)
                break

        with self.lock:
            if self.master_fd is not None:
                try:
                    os.close(self.master_fd)
                except Exception:
                    pass
                self.master_fd = None

            info = get_auth_token_info()
            if info.get("logged_in") or info.get("is_valid"):
                self.state = "SUCCESS"
                self.prompt_message = f"تم تسجيل الدخول بنجاح بحساب: {info.get('email', '')}"
            elif self.state not in ["SUCCESS", "WAITING_FOR_CODE", "WAITING_FOR_TERMS"]:
                self.state = "IDLE"
                if not os.path.exists(AUTH_TOKEN_FILE) and os.path.exists(AUTH_TOKEN_FILE + ".bak"):
                    try:
                        shutil.copy2(AUTH_TOKEN_FILE + ".bak", AUTH_TOKEN_FILE)
                    except Exception:
                        pass

    def submit_code(self, code):
        with self.lock:
            if not self.proc or self.proc.poll() is not None or self.master_fd is None:
                return {"status": "error", "message": "لا توجد جلسة مصادقة نشطة حالياً"}
            try:
                payload = (code.strip() + "\n").encode("utf-8")
                os.write(self.master_fd, payload)
                self.prompt_message = "جاري التحقق من الكود وتفعيل ترخيص الحساب..."
                return {"status": "ok", "wizard": self._get_state_locked()}
            except Exception as e:
                return {"status": "error", "message": str(e)}

    def accept_terms(self, accept=True):
        with self.lock:
            if not self.proc or self.proc.poll() is not None or self.master_fd is None:
                return {"status": "error", "message": "لا توجد جلسة مصادقة نشطة حالياً"}
            try:
                payload = b"y\n" if accept else b"n\n"
                os.write(self.master_fd, payload)
                self.prompt_message = "تم إرسال الموافقة على الشروط، جاري استكمال التسجيل..."
                return {"status": "ok", "wizard": self._get_state_locked()}
            except Exception as e:
                return {"status": "error", "message": str(e)}

    def logout(self):
        with self.lock:
            self._terminate_locked()
            if os.path.exists(AUTH_TOKEN_FILE):
                try:
                    os.remove(AUTH_TOKEN_FILE)
                    return {"status": "ok", "message": "تم تسجيل الخروج بنجاح ومسح بيانات الجلسة"}
                except Exception as e:
                    return {"status": "error", "message": f"فشل مسح ملف الجلسة: {e}"}
            return {"status": "ok", "message": "الحساب غير مسجل بالفعل"}

    def cancel(self):
        with self.lock:
            self._terminate_locked()
            self.state = "IDLE"
            self.prompt_message = "تم إلغاء عملية تسجيل الدخول."
            if not os.path.exists(AUTH_TOKEN_FILE) and os.path.exists(AUTH_TOKEN_FILE + ".bak"):
                try:
                    shutil.copy2(AUTH_TOKEN_FILE + ".bak", AUTH_TOKEN_FILE)
                except Exception:
                    pass
            return {"status": "ok", "wizard": self._get_state_locked()}

    def _terminate_locked(self):
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=1.0)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except Exception:
                pass
            self.master_fd = None

auth_manager = InteractivePTYAuthManager()
