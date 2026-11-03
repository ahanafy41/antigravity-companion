# Multimedia Viewer & Universal Artifact Auto-Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide full in-app preview for Images, Audio, and Video files, alongside universal auto-discovery of all project documents and artifacts for every user of Antigravity Companion.

**Architecture:** Implement a modular backend streaming service (`media_service.py`) supporting HTTP Range Requests and token-based media auth, enhance `application.py`'s `list_artifacts` to auto-discover workspace specs and transcripts without manual user intervention, and build a clean, standalone frontend module (`media-viewer.js`) that renders accessible HTML5 players into the existing dialog.

**Tech Stack:** Python 3.10+ (aiohttp), Vanilla JS (ES6/Web Components pattern), CSS3 (ARIA/WCAG 2.2 AA), Node.js test harness.

**Spec:** `docs/superpowers/specs/2026-11-03-multimedia-artifact-viewer-design.md`

## Global Constraints

- **Strict Clean Code & Modularity**: Zero bloat added to `main-ui.js` or `application.py`. Logic lives in dedicated files `media-viewer.js` and `media_service.py`.
- **Scope Exclusion**: PDF rendering is explicitly excluded from this milestone. Focus strictly on Images, Audio, and Video.
- **Screen Reader First (WCAG 2.2 AA)**: All interactive buttons must have explicit, Arabic `aria-label`s. Focus remains trapped in `#artifact-viewer-dialog`.
- **Cross-Origin Android WebView**: All media URLs must resolve via `getApiUrl()` to `http://127.0.0.1:7681` with token query parameter.
- **Canonical Asset Sync**: Changes in `server/web/` must synchronize to `app/src/main/assets/web/` and `~/.antigravity-server/web/`.
- **Permanent Release Keystore**: Release builds must preserve `app/keystore/antigravity-release-key.jks`.

## Review Focus

1. Path traversal attacks attempting to access files outside allowed workspace or brain directory via `/api/v1/files/raw`.
2. Audio/video playback failure on Android WebView caused by missing Cross-Origin headers or CSRF blockage.
3. Media streaming seeking failure on mobile browsers due to missing HTTP 206 Partial Content (Range) headers.
4. Auto-discovery crashing on missing, malformed, or unreadable markdown files in workspace.
5. Focus trap confusion in TalkBack/Jieshuo when dialog opens media elements.

---

### Task 1: Universal Artifact & Document Auto-Discovery (`server/application.py`)

**Files:**
- Modify: `server/application.py:1080-1160`
- Test: `server/test_artifact_discovery.py`

**Interfaces:**
- Produces: Enhanced `GET /api/v1/artifacts` JSON output containing both brain artifacts and discovered workspace documents (`docs/superpowers/specs/*.md`, `plans/*.md`, `task.md`).

- [ ] **Step 1: Write the failing test for auto-discovery**

Create `server/test_artifact_discovery.py` testing that `list_artifacts`:
1. Surfaces `.md` files in brain without `.metadata.json`.
2. Discovers specs and plans in `docs/superpowers/specs/` and `docs/superpowers/plans/`.
3. Auto-synthesizes title and summary from first heading.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest server/test_artifact_discovery.py`
Expected: FAIL (missing auto-discovery logic)

- [ ] **Step 3: Implement auto-discovery in `server/application.py`**

Refactor `list_artifacts` in `server/application.py`:
- Scan `BRAIN_DIR / clean_cid` for any `.md` file, synthesizing metadata if `.metadata.json` is absent.
- Scan workspace roots for `docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md`, and `task.md`.
- Inspect `transcript.jsonl` for recent `write_file` paths.
- Return deduplicated artifacts array sorted by `mtime` descending.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest server/test_artifact_discovery.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/application.py server/test_artifact_discovery.py
git commit -m "feat(server): auto-discover workspace specs, plans, and unindexed brain artifacts"
```

---

### Task 2: Modular Raw Media Streaming Service (`server/media_service.py` & CSP)

**Files:**
- Create: `server/media_service.py`
- Modify: `server/application.py` (route registration and CSP update)
- Test: `server/test_media_service.py`

**Interfaces:**
- Produces: `GET /api/v1/files/raw` endpoint streaming raw files with Range requests and token authentication.

- [ ] **Step 1: Write failing tests for media streaming service**

Create `server/test_media_service.py` verifying:
1. Valid file returns `FileResponse` with correct MIME type (e.g. `image/png`, `audio/mpeg`, `video/mp4`).
2. HTTP Range request (`Range: bytes=0-100`) returns HTTP 206 Partial Content.
3. Path traversal outside workspace root returns HTTP 403 Forbidden.
4. Token authentication via query param `?token=...` is accepted.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest server/test_media_service.py`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `server/media_service.py`**

Implement `serve_raw_file(request)`:
- Path verification using `api_path(request, path)` and `BRAIN_DIR`.
- Authentication via session cookie OR `token`/`csrf` query parameter verified against active sessions.
- MIME type detection via `mimetypes.guess_type`.
- Return `aiohttp.web.FileResponse(file_path)` which natively supports HTTP Range requests.

In `server/application.py`:
- Register route `web.get("/api/v1/files/raw", serve_raw_file)`.
- Update CSP to allow `media-src 'self' data: blob: https://appassets.androidplatform.net;` and `img-src 'self' data: blob: https://appassets.androidplatform.net;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest server/test_media_service.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/media_service.py server/application.py server/test_media_service.py
git commit -m "feat(server): add modular media streaming service with HTTP Range requests and token auth"
```

---

### Task 3: Clean Modular Media Viewer Frontend (`server/web/media-viewer.js` & CSS)

**Files:**
- Create: `server/web/media-viewer.js`
- Modify: `server/web/main-ui.css`
- Test: `server/web/run_media_viewer_tests.cjs`

**Interfaces:**
- Exposes: `window.MediaViewer = { isMediaFile, getCategory, buildMediaUrl, render }`

- [ ] **Step 1: Write Node.js unit tests for `media-viewer.js`**

Create `server/web/run_media_viewer_tests.cjs` testing:
1. `isMediaFile("pic.png")` -> `{ isMedia: true, category: 'image' }`.
2. `isMediaFile("track.mp3")` -> `{ isMedia: true, category: 'audio' }`.
3. `isMediaFile("clip.mp4")` -> `{ isMedia: true, category: 'video' }`.
4. `isMediaFile("code.js")` -> `{ isMedia: false }`.
5. `buildMediaUrl(path, token)` returns formatted stream URL with `token`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/web/run_media_viewer_tests.cjs`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `server/web/media-viewer.js` and styling in `main-ui.css`**

Implement `window.MediaViewer`:
- Extension lookup maps for images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`), audio (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.opus`), and video (`.mp4`, `.webm`, `.mkv`, `.mov`).
- `buildMediaUrl(path, cid)`: computes absolute stream URL using `window.getApiUrl ? window.getApiUrl(...) : ...` and attaches session token.
- `render(container, { name, path, url, summary })`:
  - Image: renders accessible image card with zoom toggle, dimensions, and download link.
  - Audio: renders accessible `<audio controls preload="metadata">` with skip -10s, skip +10s, speed toggles (1x, 1.25x, 1.5x, 2x), and download.
  - Video: renders responsive `<video controls preload="metadata">` container.
- Add accessible styling in `main-ui.css` with high contrast borders and large touch targets.

- [ ] **Step 4: Run test to verify it passes**

Run: `node server/web/run_media_viewer_tests.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/web/media-viewer.js server/web/main-ui.css server/web/run_media_viewer_tests.cjs
git commit -m "feat(web): add modular media-viewer component with accessible audio and video controls"
```

---

### Task 4: Web Integration & Dialog Hook (`server/web/index.html` & `main-ui.js`)

**Files:**
- Modify: `server/web/index.html`
- Modify: `server/web/main-ui.js`
- Test: `server/web/run_ui_tests.cjs`

**Interfaces:**
- Connects `#artifact-viewer-dialog` to `window.MediaViewer.render`.

- [ ] **Step 1: Write integration test**

Add test case in `server/web/run_ui_tests.cjs` verifying `openArtifactViewer` routes media files to `MediaViewer.render`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node server/web/run_ui_tests.cjs`
Expected: FAIL

- [ ] **Step 3: Implement integration**

1. In `server/web/index.html`:
   - Include `<script src="/media-viewer.js"></script>` before `main-ui.js`.
2. In `server/web/main-ui.js`:
   - In `openArtifactViewer(artName, artPath, ...)`:
     - Check `const mediaCheck = window.MediaViewer && window.MediaViewer.isMediaFile(artName || artPath);`
     - If `mediaCheck && mediaCheck.isMedia`:
       - Resolve streaming URL via `window.MediaViewer.buildMediaUrl(artPath, cid)`.
       - Call `window.MediaViewer.render(artifactViewerContent, { name: artName, path: artPath, url, summary: artSummary, category: mediaCheck.category })`.
       - Skip plain-text fetch.

- [ ] **Step 4: Run test to verify it passes**

Run: `node server/web/run_ui_tests.cjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/web/index.html server/web/main-ui.js server/web/run_ui_tests.cjs
git commit -m "feat(web): hook media-viewer into artifact-viewer dialog"
```

---

### Task 5: Canonical Asset Synchronization, Version Bump & Full Verification Gate

**Files:**
- Modify: `app/build.gradle` (version bump)
- Modify: `project_spec.json` (version bump)
- Modify: `server/version.json` (version bump)
- Sync: `server/web/*` -> `app/src/main/assets/web/` & `~/.antigravity-server/web/`

- [ ] **Step 1: Synchronize Web Assets**

Run `bash server/sync_server.sh` or copy modified web assets into `app/src/main/assets/web/` and `~/.antigravity-server/web/`.

- [ ] **Step 2: Bump Version Numbers**

Increment `versionCode` and `versionName` in `app/build.gradle`, `server/version.json`, and `project_spec.json`.

- [ ] **Step 3: Run Full Verification Suite**

1. Python unit tests: `python3 -m unittest discover -s server -p "test_*.py"`
2. Web UI test suite: `node server/web/run_tests.cjs`
3. Repository validation: `python3 scripts/validate_code.py`

- [ ] **Step 4: Commit and Push**

```bash
git add .
git commit -m "release: vX.Y.Z - add multimedia artifact viewer and universal doc auto-discovery"
```
