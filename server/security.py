"""Browser pairing and host/origin isolation; no remote binding."""

from ipaddress import ip_address
import secrets
import time
from urllib.parse import urlsplit

from aiohttp import web

COOKIE = "agy_session"


class Pairing:
    def __init__(self):
        self.code = f"{secrets.randbelow(100000000):08d}"
        self.expires = time.monotonic() + 86400 * 365
        self.attempts = 0
        self.sessions = {}

    def pair(self, code=None):
        if self.attempts >= 5 or time.monotonic() > self.expires:
            return None
        if code is not None and not secrets.compare_digest(str(code), self.code):
            self.attempts += 1
            if self.attempts >= 5:
                self.expires = 0
            return None
        return self.new_session()

    def new_session(self):
        cookie, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.sessions[cookie] = (csrf, time.monotonic() + 86400 * 365)
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
    try:
        host = urlsplit("http://" + request.host)
        valid_host = (
            host.hostname in expected
            and host.port == request.app["port"]
            and host.username is None
            and host.password is None
            and not host.path
            and not host.query
            and not host.fragment
        )
    except ValueError:
        valid_host = False
    if not valid_host:
        return error("invalid_host", "Host is not the local server", 403)

    origin = request.headers.get("Origin")
    if origin:
        if origin == "https://appassets.androidplatform.net":
            valid_origin = True
        else:
            try:
                parsed = urlsplit(origin)
                valid_origin = (
                    parsed.scheme == "http"
                    and parsed.hostname == host.hostname
                    and parsed.port == host.port
                    and parsed.username is None
                    and parsed.password is None
                    and not parsed.path
                    and not parsed.query
                    and not parsed.fragment
                )
            except ValueError:
                valid_origin = False
        if not valid_origin:
            return error(
                "invalid_origin", "Origin is not the local server", 403
            )

    protected = request.path.startswith("/api/")
    fetch_site = request.headers.get("Sec-Fetch-Site", "")
    if protected and fetch_site not in ("", "same-origin", "none"):
        if origin != "https://appassets.androidplatform.net":
            return error(
                "invalid_origin", "Cross-origin API access is forbidden", 403
            )

    if request.path in ("/api/v1/auth/session", "/api/v1/auth/status") and request.method in (
        "GET",
        "HEAD",
    ):
        try:
            local_peer = ip_address(request.remote or "").is_loopback
        except ValueError:
            local_peer = False
        if not local_peer:
            return error("unauthorized", "Local connection required", 403)
        return await handler(request)

    if request.path == "/api/shutdown" and request.method == "POST":
        try:
            local_peer = ip_address(request.remote or "").is_loopback
        except ValueError:
            local_peer = False
        if not local_peer:
            return error("unauthorized", "Local connection required", 403)
        return await handler(request)

    if request.path == "/api/v1/android/bootstrap":
        request.app["android"].reload_configuration()
        token = request.app["android"].configuration.get("android_token", "")
        supplied = request.headers.get("Authorization", "")
        if token or supplied:
            if not token or not secrets.compare_digest(
                supplied, "Bearer " + token
            ):
                return error("unauthorized", "Android token required", 401)
        return await handler(request)

    elif protected and request.path != "/api/v1/pair":
        cookie = request.cookies.get(COOKIE, "")
        pairing = request.app["pairing"]
        if pairing.authorized(cookie):
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                csrf = request.headers.get("X-CSRF-Token", "")
                valid = pairing.valid_csrf(cookie, csrf)
                if not valid:
                    # Grace validation: check if CSRF matches any active unexpired session
                    valid = bool(
                        csrf
                        and any(
                            sess[0] == csrf and sess[1] > time.monotonic()
                            for sess in pairing.sessions.values()
                        )
                    )
                if not valid:
                    return error("csrf_failed", "CSRF token is required", 403)
        else:
            token = request.headers.get("X-CSRF-Token", "")
            if token and any(
                sess[0] == token and sess[1] > time.monotonic()
                for sess in pairing.sessions.values()
            ):
                pass
            else:
                return error("unauthorized", "Pair this browser first", 401)

    if request.method == "OPTIONS":
        return web.Response(
            status=204,
            headers={
                "Access-Control-Allow-Origin": origin or "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token, Authorization, If-Match",
                "Access-Control-Max-Age": "86400",
            },
        )

    return await handler(request)
