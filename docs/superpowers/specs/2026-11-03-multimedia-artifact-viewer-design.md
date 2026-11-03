# Design Document: Multimedia Viewer & Universal Artifact Auto-Discovery (Images, Audio, Video)

**Date**: 2026-11-03  
**Status**: Approved (Scope updated: PDF excluded per user decision)  
**Project**: Antigravity Companion (`antigravity-companion-app`)  
**Target Files**:
- `server/media_service.py` (New: Raw media streaming & Range requests)
- `server/web/media-viewer.js` (New: Clean modular media renderer for Images, Audio, Video)
- `server/application.py` (Universal Artifact Auto-Discovery + Route registration + CSP update)
- `server/web/main-ui.js` (Surgical hook inside `openArtifactViewer`)
- `server/web/index.html` (Script inclusion & accessible media container styles)
- `server/web/main-ui.css` (Accessible player & image preview styling)

---

## 1. Intent and The Why

### The Problem
1. **Multimedia Inaccessibility**: When the AI agent generates, inspects, or downloads multimedia assets (images, audio clips, video recordings) in the project workspace or brain directory, the Antigravity Companion App's viewer attempts to read them as UTF-8 text via `/api/v1/artifacts/content`, causing decoder crashes, truncation, or errors.
2. **Missing Artifacts for General Users**: Currently, `list_artifacts` only looks inside `BRAIN_DIR / cid` for files ending strictly in `.metadata.json`. If an agent creates plans/specs inside the workspace (e.g. `docs/superpowers/specs/`, `plans/`, `task.md`) or creates `.md` documents in `brain` without separate `.metadata.json`, the app fails to display them as artifacts. Users are forced to manually prompt or browse raw file trees.

### The Solution
1. **Universal Artifact & Document Auto-Discovery in `server/application.py`**:
   - The server dynamically discovers all conversation artifacts (from `brain/<cid>` with or without `.metadata.json`, inferring metadata from document headers).
   - The server inspects the session's `transcript.jsonl` and workspace docs (`docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`, `task.md`) to automatically surface all work plans and documents as actionable Artifact cards with "Proceed" and "View" buttons for every user.
2. **Accessible Multimedia Viewer (`media-viewer.js` & `media_service.py`)**:
   - **Images**: Responsive rendering (PNG, JPG, JPEG, GIF, WebP, SVG) with zoom toggle and metadata.
   - **Audio**: Accessible HTML5 audio player (MP3, WAV, OGG, M4A, FLAC, AAC, OPUS) with play/pause, seek slider, speed adjustment (1x, 1.25x, 1.5x, 2x), and download.
   - **Video**: Responsive HTML5 video player (MP4, WebM, MKV) with playback controls.
   - *(PDF is explicitly excluded from this milestone).*

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Full Image, Audio, Video Support**:
  - Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`
  - Audio: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.opus`
  - Video: `.mp4`, `.webm`, `.mkv`, `.mov`
- **Universal Auto-Discovery**: Automatically list all workspace specs, plans, and brain markdown files in the Artifacts tab without manual user prompt.
- **HTTP Range Requests & Streaming (RFC 7233)**: Instant audio/video playback and seeking without RAM buffering.
- **Screen Reader First (WCAG 2.2 AA / TalkBack / Jieshuo)**: Arabic ARIA labels and focus trap within dialog.
- **Clean Architecture**: Standalone modules `media-viewer.js` and `media_service.py`.

### Non-Goals
- PDF document rendering (explicitly excluded for this phase).
- In-browser media editing or transcoding.

### Anti-Goals
- Bloating `main-ui.js` or `application.py` with monolithic procedural code.
- Disrupting screen reader focus traps with unmanaged floating windows.

---

## 3. Constraints
- **Android WebView & Port 7681**: The WebUI runs both inside Android WebView (assets) and local browser (`http://127.0.0.1:7681`).
- **Resource Efficiency**: Mobile device battery and RAM conservation in Termux. Files must stream via `aiohttp.web.FileResponse` which streams efficiently in chunks.
- **Security & Permissions**: No file outside the permitted workspace or brain directory may be served.

---

## 4. Approaches Considered

### Approach 1: Modular In-Dialog Viewer (Chosen Approach)
- **Concept**: Enhance `#artifact-viewer-dialog` so `#artifact-viewer-content` seamlessly renders the appropriate player or viewer based on file extension.
- **Pros**:
  - Keeps focus management intact for TalkBack and Jieshuo.
  - Familiar, predictable UX.
  - Clean implementation via `media-viewer.js`.
- **Cons**:
  - Playback stops when dialog is closed. (Acceptable and standard for file inspection).

### Approach 2: Floating Sticky Mini-Player
- **Concept**: Audio/video detaches into a bottom-anchored mini-player.
- **Trade-off**: High complexity, conflicts with chat input box and TalkBack focus. Dropped in favor of Approach 1.

---

## 5. Architectural Specification

### 5.1 Backend: `server/media_service.py` & `application.py`
1. Endpoint: `GET /api/v1/files/raw`
   - Parameters:
     - `path`: Absolute or relative path to file.
     - `conversation_id`: (Optional) for brain artifacts.
     - `name`: (Optional) file name within artifact directory.
     - `token`: (Optional) session token or CSRF token for authenticating native HTML5 media elements (`<audio>`, `<video>`, `<img>`) that cannot send custom HTTP headers.
   - Authentication & Security (`server/security.py`):
     - Validates via session cookie OR via `token` query parameter against active session CSRF/auth tokens.
     - Verifies Origin/Referer matches loopback (`127.0.0.1:*`, `localhost:*`) or Android app asset origin (`https://appassets.androidplatform.net`).
   - Validation:
     - Resolves path against allowed workspace roots (`api_path(request, path)`) or `BRAIN_DIR / cid / name`.
     - Ensures file exists, is a regular file, and prevents symlink escape.
   - Response:
     - `aiohttp.web.FileResponse(resolved_path)` which natively handles `Range`, `Content-Length`, `ETag`, and `Content-Type`.
2. Content Security Policy (CSP):
   - Update in `application.py`:
     - `media-src 'self' data: blob: https://appassets.androidplatform.net;`
     - `img-src 'self' data: blob: https://appassets.androidplatform.net;`

### 5.2 Frontend: `server/web/media-viewer.js`
Exposes `window.MediaViewer` with the following clean API:
- `isMediaFile(filename)`: Returns `{ isMedia: bool, category: 'image'|'audio'|'video' }`.
- `buildMediaUrl(path, cid)`: Uses `getApiUrl()` to resolve the absolute URL (`http://127.0.0.1:7681/api/v1/files/raw?path=...&token=...`) ensuring seamless cross-origin playback inside Android WebView.
- `render(container, { name, path, url, summary })`:
  - Renders image viewer with responsive max dimensions, alt tags, and zoom toggle.
  - Renders audio player with accessible controls: Play/Pause, +10s / -10s skip buttons, speed selection, volume, and time display.
  - Renders video player with native controls and responsive wrapper.

### 5.3 Integration in `server/web/main-ui.js`
In `openArtifactViewer`:
1. Check `const mediaType = window.MediaViewer ? window.MediaViewer.getType(artName || artPath) : null;`
2. If `mediaType` is `'image'`, `'audio'`, `'video'`, or `'pdf'`:
   - Compute streaming raw URL: `/api/v1/files/raw?path=${encodeURIComponent(artPath)}`
   - Call `window.MediaViewer.render(artifactViewerContent, { ... })`
   - Skip text fetching.
3. If text/markdown:
   - Continue with existing text fetching logic.

---

## 6. What's Left to the Builder
- Precise CSS styling for the audio player and video wrapper in `main-ui.css`.
- Exact skip seconds (+10s / -10s) and speed presets for the audio player.
- Automated unit test suite verifying `media_service.py` path security and Range requests.
