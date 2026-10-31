# Live Reconnection & Rich Transcript Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable seamless, automatic reconnection to active agent tasks when reopening the app, restore rich multi-step tool and thinking transcripts without empty "no response" cards, and re-enable live step announcements for TalkBack and Jieshuo screen readers.

**Architecture:** 
1. Persist active conversation and session pointers in `localStorage` across Android WebView lifecycles.
2. In the backend (`sessions.py` & `legacy_conversations.py`), expose active running run metadata (`active_run`) alongside rich transcripts instead of stripping tools and thoughts.
3. In `main-v1-adapter.js` and `main-ui.js`, detect `active_run` upon opening any conversation; if a run is currently executing on the server daemon, seamlessly re-attach to the live SSE stream, reconstruct the live agent progress card, and announce tool execution steps (`جارٍ تنفيذ أداة: X (خطوة Y)`) to screen readers.
4. If a task finished while the app was closed, hydrate the full rich transcript with tool cards, thoughts, and complete agent responses.

**Tech Stack:** JavaScript (ES2022 / Web APIs, SSE, ARIA Live, LocalStorage), Python 3.14 (aiohttp, asyncio, JSONL parsing), Android Native WebView Assets.

**Spec:** Brainstorming alignment with Ahmed (Choice 1: Seamless Live Reconnection & Full Rich Transcripts).

## Global Constraints

- No wiping or wholesale replacement of existing files; atomic precision line editing only.
- Screen Reader Accessibility (WCAG / TalkBack / Jieshuo): ARIA live announcements must be clean, polite, and free of emoji noise or confusing wide tables.
- Permanent release keystore invariants must be strictly maintained (`app/keystore/antigravity-release-key.jks`).
- Zero critical or high security vulnerabilities (no token leak, no raw command injection).
- All changes must pass 100% of unit and integration test suites.

## Review Focus

1. **App killed while agent executes tool**: Reopening the app must automatically detect the active run and stream events from the exact point of execution without double-execution or state loss.
2. **App reopened after agent finishes**: The conversation must show the completed response, thoughts accordion, and tool cards, never displaying `(لا يوجد نص إضافي في هذا الرد)`.
3. **Storage Fallback**: If `localStorage` is disabled or blocked in a restricted webview environment, fallback gracefully to `sessionStorage` and in-memory cache without crashing.
4. **Screen Reader announcements**: Announce tool steps to TalkBack/Jieshuo with step index and name in Arabic, without spamming repeated announcements on delta chunks.
5. **OTA Asset Consistency**: All web files in `server/web/` must match `app/src/main/assets/web/` and `app/src/main/assets/server/web/`.

---

### Task 1: Server-Side Active Run Detection & Rich Message Exposure

**Files:**
- Modify: `server/sessions.py`
- Modify: `server/legacy_conversations.py`
- Test: `scripts/test_active_run_reconnection.py`

- [ ] Step 1: Write failing test `scripts/test_active_run_reconnection.py` verifying that:
  - When a session has an active running run, `/sessions/{id}` and conversation details report `active_run: {run_id, state: "running", message}`.
  - Finished sessions retain full tool steps, thinking, and responses in transcript.
- [ ] Step 2: Run test to confirm failure: `python3 scripts/test_active_run_reconnection.py`
- [ ] Step 3: Implement active run detection in `server/sessions.py`:
  - In `Sessions.detail(session_id)`: include `active_run` metadata if any run in the session has `state == "running"`.
- [ ] Step 4: In `server/legacy_conversations.py`:
  - Ensure `transcript()` properly retains `tool_count`, `tools`, `thinking`, and non-empty fallback status banners even if text was not finalized.
- [ ] Step 5: Run tests and confirm pass: `python3 scripts/test_active_run_reconnection.py` && `python3 scripts/run_backend_tests.py`
- [ ] Step 6: Commit changes: `git commit -am "feat(server): expose active run metadata and rich transcript history"`

---

### Task 2: Adapter Bridge Support for LocalStorage & Rich History (`server/web/main-v1-adapter.js`)

**Files:**
- Modify: `server/web/main-v1-adapter.js`
- Test: `server/web/run_tests.cjs`

- [ ] Step 1: In `server/web/main-v1-adapter.js`:
  - Replace `global.sessionStorage` with safe storage wrapper `getPersistentStorage()` that prefers `global.localStorage` and falls back to `global.sessionStorage`.
  - In `conversation(id)`:
    - Instead of overriding rich messages with stripped `runMessages`, query `/legacy/conversations/{id}` to get full tool calls and thinking.
    - Check if the matching session has an active run (`state === "running"`).
    - If active, include `active_run: { run_id, state: "running", message }` in the returned object.
- [ ] Step 2: In `stream(payload)`:
  - If a run is already active for this session, re-attach to the existing `runId` rather than conflicting or creating duplicate runs.
- [ ] Step 3: Run unit tests: `node server/web/run_tests.cjs`
- [ ] Step 4: Commit changes: `git commit -am "feat(adapter): enable persistent conversation storage and active run pass-through"`

---

### Task 3: Frontend Live Reconnection & Screen Reader Step Announcements (`server/web/main-ui.js`)

**Files:**
- Modify: `server/web/main-ui.js`
- Test: `scripts/test_streaming_resilience.py`

- [ ] Step 1: In `server/web/main-ui.js`:
  - In `resumeConversation(convId, convTitle)`:
    - Check if `data.active_run && data.active_run.state === 'running'`.
    - If running:
      - Mark `isAiGenerating = true`.
      - Construct the live generating card with `chat-message ai-message generating`.
      - Show live progress header: `الوكيل الذكي (يعمل الآن...)`.
      - Announce via `announce('تمت استعادة الاتصال بالمهمة الجارية، الوكيل يعمل الآن...')`.
      - Connect to live stream reader to consume SSE events until completion.
    - If completed:
      - Render full history with thinking accordions and tool cards.
      - Ensure no cards display `(لا يوجد نص إضافي في هذا الرد)` when tools or thinking are present.
- [ ] Step 2: Add live screen reader announcements for tools:
  - In `tool_step` handler:
    - On `data.state === 'ACTIVE'`:
      - Announce: `جارٍ تنفيذ أداة: ${toolDesc} (خطوة رقم ${currentStepNum})`.
    - On `data.state === 'DONE'`:
      - Announce: `اكتملت أداة: ${toolDesc}`.
- [ ] Step 3: On startup (`initAiStudio`):
  - Check persistent storage for last active conversation.
  - Automatically call `resumeConversation` if present.
- [ ] Step 4: Run verification tests: `python3 scripts/test_streaming_resilience.py`
- [ ] Step 5: Commit changes: `git commit -am "feat(ui): implement live run reconnection and accessible step announcements"`

---

### Task 4: Asset Synchronization & OTA Release Protocol (v1.5.2)

**Files:**
- Modify: `app/build.gradle`
- Modify: `.github/workflows/build-apk.yml`
- Modify: `project_spec.json`
- Modify: `server/version.json`
- Synchronize: `app/src/main/assets/web/main-ui.js`, `app/src/main/assets/web/main-v1-adapter.js`, `app/src/main/assets/server/`

- [ ] Step 1: Bump version to `1.5.2` (code `25`):
  - `app/build.gradle`: `versionCode 25`, `versionName "1.5.2"`.
  - `.github/workflows/build-apk.yml`: default tag `v1.5.2`.
  - `project_spec.json`: `version: "1.5.2"`.
  - `server/version.json`: `version: "1.5.2"`.
- [ ] Step 2: Synchronize web assets to `app/src/main/assets/` and `~/.antigravity-server/web/`.
- [ ] Step 3: Run all backend and resilience tests to verify 100% pass:
  - `python3 scripts/run_backend_tests.py`
  - `python3 scripts/test_conversation_resilience_and_management.py`
  - `python3 scripts/test_legacy_conversations_tools.py`
  - `python3 scripts/test_streaming_resilience.py`
  - `node server/web/run_tests.cjs`
- [ ] Step 4: Commit and finalize: `git commit -am "chore(release): bump to v1.5.2 with live reconnection and asset sync"`
