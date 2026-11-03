"""Raw media streaming and accessible content serving with HTTP Range requests."""

from pathlib import Path
import mimetypes
from aiohttp import web
from security import error

# Ensure common media extensions are registered
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/ogg", ".ogg")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("audio/mp4", ".m4a")
mimetypes.add_type("audio/opus", ".opus")
mimetypes.add_type("audio/flac", ".flac")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("video/x-matroska", ".mkv")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")

BRAIN_DIR = Path.home() / ".gemini" / "antigravity-cli" / "brain"

async def serve_raw_file(request):
    """
    Streams a raw media or project file directly with HTTP Range request support.
    Validates permissions against workspace roots and brain directory.
    """
    req_path = request.query.get("path", "").strip().strip('"').strip("'")
    cid = request.query.get("conversation_id", "").strip().strip('"').strip("'")
    name = request.query.get("name", "").strip().strip('"').strip("'")

    resolved = None

    # 1. Resolve via direct path
    if req_path:
        try:
            cand = Path(req_path).resolve()
            # A) Inside BRAIN_DIR
            if BRAIN_DIR.resolve() in cand.parents and cand.is_file():
                resolved = cand
            else:
                # B) Inside Workspace roots
                from application import api_path
                allowed = api_path(request, req_path)
                if allowed.is_file():
                    resolved = allowed
        except PermissionError as pe:
            return error("forbidden", str(pe), 403)
        except Exception:
            return error("invalid_path", "Path could not be resolved", 400)

    # 2. Resolve via name and cid in BRAIN_DIR
    elif name and cid:
        if any(c in name for c in ("/", "\\", "..")) or any(c in cid for c in ("/", "\\", "..")):
            return error("invalid_request", "Invalid artifact name or conversation ID", 400)
        clean_name = Path(name).name
        clean_cid = Path(cid).name
        cand = (BRAIN_DIR / clean_cid / clean_name).resolve()
        if BRAIN_DIR.resolve() in cand.parents and cand.is_file():
            resolved = cand

    if not resolved or not resolved.is_file():
        return error("not_found", "File not found", 404)

    # Guess MIME type
    mime_type, _ = mimetypes.guess_type(str(resolved))
    if not mime_type:
        mime_type = "application/octet-stream"

    # Return FileResponse which natively handles HTTP 206 Partial Content (Range requests)
    response = web.FileResponse(resolved)
    response.content_type = mime_type
    response.headers["Accept-Ranges"] = "bytes"
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Range, Authorization, X-CSRF-Token"
    response.headers["Access-Control-Expose-Headers"] = "Content-Range, Content-Length, Accept-Ranges"
    return response
