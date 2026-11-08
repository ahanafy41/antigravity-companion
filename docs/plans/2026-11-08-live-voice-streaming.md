# Implementation Plan: Bi-directional Live Voice Streaming, Prebuilt Voice Catalog, and Android Microphone Bridge

- **Branch**: `feat/live-voice-streaming`
- **Spec / System Design**: `docs/design/live-voice-streaming/DESIGN.md`
- **Execution Mode**: Inline (`/executing-plans`)

---

## Task 1: Android App Permissions & WebChromeClient Audio Authorization

### Objective
Enable microphone capture in the Android Companion APK by declaring permissions in `AndroidManifest.xml`, checking runtime permissions in `MainActivity.java`, and authorizing `RESOURCE_AUDIO_CAPTURE` in `WebChromeClient.onPermissionRequest` for the trusted local origin.

### Steps
1. **Write failing test**: `scripts/test_android_audio_permissions.py` asserting that `AndroidManifest.xml` declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, and `MainActivity.java` grants `RESOURCE_AUDIO_CAPTURE` on trusted origin.
   - Run: `python3 scripts/test_android_audio_permissions.py`
   - **Expected**: Fails with missing permissions / denial in WebChromeClient.
2. **Implementation**:
   - Edit `app/src/main/AndroidManifest.xml`:
     Add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` and `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`.
   - Edit `app/src/main/java/com/antigravity/companion/MainActivity.java`:
     Add `REQUEST_RECORD_AUDIO = 2002`, check/request `Manifest.permission.RECORD_AUDIO` in `onCreate()`, and update `WebChromeClient.onPermissionRequest()`:
     If origin matches `origins.allowsNativeOrigin(request.getOrigin().toString())` and request has `PermissionRequest.RESOURCE_AUDIO_CAPTURE`, grant `new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}`.
3. **Verification**:
   - Run: `python3 scripts/test_android_audio_permissions.py`
   - **Expected**: PASS.
4. **Commit**: `feat(android): add RECORD_AUDIO permission and WebChromeClient audio capture grant`

---

## Task 2: Backend Gemini Prebuilt Voice Catalog & Settings Integration

### Objective
Create the prebuilt voice catalog module defining the 30 curated Gemini 3.8 studio voices (Puck, Charon, Aoede, Kore, Fenrir, Zephyr, etc.), expose `GET /api/v1/voice/catalog`, and persist `selected_voice` in companion settings.

### Steps
1. **Write failing test**: `scripts/test_voice_catalog.py` checking `/api/v1/voice/catalog` returns 30 voices with `id`, `name`, `persona_ar`, `persona_en`, and default voice `'Puck'`.
   - Run: `python3 scripts/test_voice_catalog.py`
   - **Expected**: Fails (404 or missing module).
2. **Implementation**:
   - Create `server/voice_catalog.py` with `PREBUILT_VOICES` mapping and helper `get_voice_catalog()`.
   - Register `GET /api/v1/voice/catalog` in `server/application.py`.
   - Ensure `selected_voice` is recognized in `server/cli_settings.py` / `storage.py`.
3. **Verification**:
   - Run: `python3 scripts/test_voice_catalog.py`
   - **Expected**: PASS (30 voices validated).
4. **Commit**: `feat(server): add prebuilt voice catalog endpoint and voice settings`

---

## Task 3: Backend Live Voice Duplex WebSocket Route (`/api/v1/voice/live`)

### Objective
Implement the bi-directional streaming WebSocket handler `/api/v1/voice/live` in the companion server, bridging audio packets and live transcripts between the client and the Gemini Live protocol.

### Steps
1. **Write failing test**: `scripts/test_live_voice_bridge.py` testing WebSocket connection handshake, setup message with `selected_voice`, duplex binary audio chunk piping, and clean teardown.
   - Run: `python3 scripts/test_live_voice_bridge.py`
   - **Expected**: Fails (route not found).
2. **Implementation**:
   - Create `server/live_voice_bridge.py` containing `LiveVoiceBridge` class managing the upstream/downstream audio queues, state transitions (`connecting`, `active`, `muted`, `closed`), and transcript synchronization.
   - Register `web.get("/api/v1/voice/live", handle_live_voice)` in `server/application.py`.
3. **Verification**:
   - Run: `python3 scripts/test_live_voice_bridge.py`
   - **Expected**: PASS.
4. **Commit**: `feat(server): implement live voice duplex websocket bridge`

---

## Task 4: WebUI Accessible "بدء البث المباشر" Button, Voice Selector & Audio Engine

### Objective
Add the accessible toggle button "بدء البث المباشر" to `web/index.html`, add the voice selector modal/dropdown, and implement the Web Audio API client in `web/app.js` with hardware echo cancellation and TalkBack/Jieshuo announcements.

### Steps
1. **Write failing test**: `server/web/run_live_voice_ui_tests.cjs` verifying button presence, accessibility attributes (`aria-pressed`, `aria-label`, `aria-live`), voice selector controls, and audio state transitions.
   - Run: `node server/web/run_live_voice_ui_tests.cjs`
   - **Expected**: Fails (button/controls missing).
2. **Implementation**:
   - Update `server/web/index.html`: Add `#btn-live-voice` in header with accessible labels and add voice selection menu in settings dialog.
   - Update `server/web/app.js`: Implement `LiveVoiceController` managing `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })`, `AudioContext`, WebSocket audio streaming, incoming playback, and `sr-announcer` status voice prompts.
   - Synchronize `server/web/index.html` and `server/web/app.js` to `app/src/main/assets/web/`.
3. **Verification**:
   - Run: `node server/web/run_live_voice_ui_tests.cjs`
   - **Expected**: PASS.
4. **Commit**: `feat(web): add accessible live voice button, voice selector, and audio client`

---

## Task 5: Full Regression Testing & Release Verification

### Objective
Run all backend tests, UI test suites, asset sync verifications, and ensure zero regressions across the entire companion codebase.

### Steps
1. Run `python3 scripts/run_backend_tests.py` -> Expected: 100% PASS.
2. Run `node server/web/run_tests.cjs` -> Expected: 100% PASS.
3. Run `python3 scripts/run_android_web_asset_tests.py` -> Expected: 100% PASS.
4. Commit: `chore(release): verify all live voice streaming tests and sync assets`
