"""Browser pairing and host/origin isolation; no remote binding."""

import secrets
import time
from urllib.parse import urlsplit

from aiohttp import web

COOKIE = "agy_session"


class Pairing:
    def __init__(self):
        self.code = f"{secrets.randbelow(100000000):08d}"
        self.expires = time.monotonic() + 120
        self.attempts = 0
        self.sessions = {}

    def pair(self, code):
        if self.attempts >= 5 or time.monotonic() > self.expires:
            return None
        self.attempts += 1
        if not isinstance(code, str) or not secrets.compare_digest(
            code, self.code
        ):
            return None
        self.expires = 0
        return self.new_session()

    def new_session(self):
        cookie, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.sessions[cookie] = (csrf, time.monotonic() + 86400)
        return cookie, csrf

    def authorized(self, cookie):
        session = self.sessions.get(cookie)
        return bool(session and session[1] > time.monotonic())

    def valid_csrf(self, cookie, csrf):
        return self.authorized(cookie) and secrets.compare_digest(
            self.sessions[cookie][0], csrf
        )


def error(code, message, status=400):
    return web.json_response(
        {"code": code, "message": message, "request_id": secrets.token_hex(8)},
        status=status,
    )


@web.middleware
async def isolation(request, handler):
    expected = {"127.0.0.1", "localhost"}
    host = urlsplit("http://" + request.host)
    if host.hostname not in expected or host.port != request.app["port"]:
        return error("invalid_host", "Host is not the local server", 403)
    origin = request.headers.get("Origin")
    if origin:
        parsed = urlsplit(origin)
        if (
            parsed.scheme != "http"
            or parsed.hostname not in expected
            or parsed.port != request.app["port"]
        ):
            return error(
                "invalid_origin", "Origin is not the local server", 403
            )
    protected = request.path.startswith("/api/")
    if request.path == "/api/v1/android/bootstrap":
        request.app["android"].reload_configuration()
        token = request.app["android"].configuration.get("android_token", "")
        supplied = request.headers.get("Authorization", "")
        if not token or not secrets.compare_digest(
            supplied, "Bearer " + token
        ):
            return error("unauthorized", "Android token required", 401)
    elif protected and request.path != "/api/v1/pair":
        cookie = request.cookies.get(COOKIE, "")
        pairing = request.app["pairing"]
        if not pairing.authorized(cookie):
            return error("unauthorized", "Pair this browser first", 401)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            if not pairing.valid_csrf(
                cookie, request.headers.get("X-CSRF-Token", "")
            ):
                return error("csrf_failed", "CSRF token is required", 403)
    return await handler(request)
