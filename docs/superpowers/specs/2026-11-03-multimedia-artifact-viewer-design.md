# Design Document: Multimedia Artifact & Project File Viewer (Images, Audio, Video, PDF)

**Date**: 2026-11-03  
**Status**: Pending Review  
**Project**: Antigravity Companion (`antigravity-companion-app`)  
**Target Files**:
- `server/media_service.py` (New: Raw media streaming & Range requests)
- `server/web/media-viewer.js` (New: Clean modular media renderer)
- `server/application.py` (Route registration & CSP update)
- `server/web/main-ui.js` (Surgical hook inside `openArtifactViewer`)
- `server/web/index.html` (Script inclusion & accessible media container styles)
- `server/web/main-ui.css` (Accessible player & image preview styling)

---

## 1. Intent and The Why

### The Problem
When the AI agent creates or touches multimedia assets (audio recordings, speech syntheses, camera captures, generated/inspected images, screen recordings, videos, or PDF documents) within the project workspace or brain artifacts directory, the Antigravity Companion App's current file viewer (`artifact-viewer-dialog`) treats all files as plain UTF-8 text:
1. It requests `/api/v1/artifacts/content` which attempts `read_text(encoding="utf-8")`.
2. Binary files (images, audio, video) fail with decoding errors, or get truncated, or exceed the 2MB text limit.
3. The user cannot see images, listen to audio files, watch videos, or inspect PDFs directly inside the app, forcing them to switch to external Android file managers.
4. Screen reader users (TalkBack / Jieshuo) lack accessible, predictable controls to listen to agent-produced audio clips or view file descriptions directly in-app.

### The Solution
Implement an accessible, high-performance, and modular **Multimedia Artifact & File Viewer** directly integrated into the companion app's existing viewer dialog:
- **Images**: Responsive, high-fidelity image rendering (PNG, JPG, JPEG, GIF, WebP, SVG) with zoom toggle and metadata.
- **Audio**: Clean, accessible HTML5 audio player (MP3, WAV, OGG, M4A, FLAC, AAC) supporting play/pause, seek slider, speed adjustment (1x, 1.25x, 1.5x, 2x), and download.
- **Video**: Responsive HTML5 video player (MP4, WebM, MKV) with full playback controls.
- **Documents & PDFs**: Native document/PDF embedding with fallback direct download.
- **Modular Clean Architecture**: Zero bloating of `main-ui.js` or `application.py`. Logic is isolated into `media-viewer.js` (Frontend) and `media_service.py` (Backend).

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Full Media Format Coverage**:
  - Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`
  - Audio: `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.opus`
  - Video: `.mp4`, `.webm`, `.mkv`, `.mov`
  - Documents: `.pdf`, `.md`, `.txt`, and code files
- **HTTP Range Requests & Streaming (RFC 7233)**:
  - Audio and video files must support seeking and partial buffering without loading the entire multi-megabyte file into memory.
- **Screen Reader First (WCAG 2.2 AA / TalkBack / Jieshuo)**:
  - All player controls must have clear Arabic ARIA labels (`aria-label="تشغيل الصوت"`, `aria-label="تقديم 10 ثوانٍ"`).
  - Focus trap remains strictly within the existing dialog (`#artifact-viewer-dialog`) for smooth keyboard/gesture navigation.
- **Modular Clean Code**:
  - Independent `media-viewer.js` UI module.
  - Independent `media_service.py` backend module.
- **Zero Vulnerabilities**:
  - Strict path traversal defense using `api_path()` workspace bounds checking.
  - MIME-type sniffing defense (`X-Content-Type-Options: nosniff`).
  - CSP updated to allow local media streaming (`media-src 'self' data: blob: https://appassets.androidplatform.net;`).

### Non-Goals
- Building an in-app video editing or audio mixing studio.
- Transcoding media on mobile CPU (Termux). The browser plays native Android-supported web formats directly.

### Anti-Goals
- Adding hundreds of lines of code into `main-ui.js` or `application.py`.
- Creating floating popups or unmanaged background windows that confuse screen reader focus.

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
- `isMediaFile(filename)`: Returns `{ isMedia: bool, category: 'image'|'audio'|'video'|'pdf'|'code'|'markdown' }`.
- `buildMediaUrl(path, cid)`: Uses `getApiUrl()` to resolve the absolute URL (`http://127.0.0.1:7681/api/v1/files/raw?path=...&token=...`) ensuring seamless cross-origin playback inside Android WebView.
- `render(container, { name, path, url, summary })`:
  - Renders image viewer with responsive max dimensions, alt tags, and zoom toggle.
  - Renders audio player with accessible controls: Play/Pause, +10s / -10s skip buttons, speed selection, volume, and time display.
  - Renders video player with native controls and responsive wrapper.
  - Renders PDF viewer: An accessible, lightweight document card showing filename, file size, page count/metadata (if available), with clear buttons for "تنزيل المستند (Download)" and "فتح في قارئ خارجي (Open with external app)". This avoids heavy JavaScript runtimes (like PDF.js) and guarantees seamless TalkBack/Jieshuo accessibility.

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
