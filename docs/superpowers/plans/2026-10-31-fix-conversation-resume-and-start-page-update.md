# Fix Conversation Resumption, Slowness & Start Page Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate conversation resumption failures ("تعذر الاتصال") and extreme execution slowness caused by transcript replay floods, and fix the in-app OTA update button on the start page (`start.html`) with proper permission handling and progress callbacks.

**Architecture:** 
1. Surgical fix in `server/sessions.py` to baseline `poll_transcript` to current transcript length so past turns are not replayed into active live SSE streams, and clear stale zombie run locks.
2. Robust session resumption in `server/web/main-v1-adapter.js` and `server/application.py` so resuming past sessions safely connects without dead session IDs or 500 errors.
3. Complete update lifecycle in `server/web/start-ui.js` mirroring `main-ui.js` (including `canInstallUnknownApps` check, `onUpdateDownloadComplete`, `onUpdateDownloadError`, and permission prompts).
4. Dual-copy synchronization to `app/src/main/assets/web/` and regression verification.

**Tech Stack:** Python 3 (asyncio, aiohttp/http.server), Vanilla ES2022 JavaScript, Web Speech/ARIA live regions, AndroidX WebView Bridge, Bash/Termux.

**Spec:** Reported issues:
1. Resuming past conversations fails or hangs ("تعذر الاتصال" / inability to continue turns).
2. Starting a turn in a resumed conversation is extremely slow (due to replaying all historical thoughts/tools into live SSE).
3. The update button on `start.html` notifies the user of an update, but clicking "تثبيت التحديث الآن" fails to install (only works from the side drawer in `main-ui.js`).

## Global Constraints

- **Dual-Copy Invariant:** Canonical web assets live in `server/web/`. Edits must be synchronized to `app/src/main/assets/web/` using `python3 scripts/sync_android_web.py`.
- **Screen Reader Invariant:** All status updates, progress states, and error alerts must announce clearly to TalkBack and Jieshuo (`CSR`) using ARIA live regions and concise Arabic text.
- **Zero Broken Tests:** `python3 scripts/run_backend_tests.py` and `python3 scripts/sync_android_web.py --check` must pass 100%.
- **Subprocess Safety:** All process spawning must use argument lists with `shell=False`.

## Review Focus

1. **Massive transcripts:** Resuming a conversation with 50+ turns must not re-emit past thoughts and tools into the new turn's SSE stream.
2. **Stale session ID:** When the app is closed and reopened, an expired session ID in `sessionStorage` must gracefully refresh without triggering a permanent "تعذر الاتصال".
3. **Missing install permission:** If Android install permission is not granted, `start.html` must display an accessible button to open settings rather than silently failing.
4. **Zombie run locks:** If an earlier turn was killed ungracefully, new turns must not be permanently blocked by `RunConflict` ("A turn is already active").
5. **Asset parity:** Web changes in `server/web/` must match `app/src/main/assets/web/` exactly.

---

### Task 1: Fix Transcript Polling Flood & Stale Run Locks in `server/sessions.py`

**Files:**
- Modify: `server/sessions.py:485-515,910-935`
- Test: `scripts/run_backend_tests.py`

**Interfaces:**
- Consumes: `session["conversation_id"]`, `brain_dir`, `self.runs`
- Produces: Sanitized `last_line` initialization in `poll_transcript` that starts from the end of the existing file; automatic cleanup of defunct running states in `check_capacity`.

- [ ] **Step 1: Write unit test in `scripts/run_backend_tests.py` for transcript baseline and capacity clearance**

Verify that:
1. When a session with an existing transcript is polled, `poll_transcript` does not emit thoughts from lines existing prior to turn execution.
2. Defunct runs whose processes/tasks are dead do not trigger `RunConflict`.

- [ ] **Step 2: Run test to observe failure/behavior**

Run: `python3 scripts/run_backend_tests.py -v`

- [ ] **Step 3: Implement baseline cursor in `poll_transcript` and run reaper in `sessions.py`**

1. In `poll_transcript(self, session, run)`:
   Check `conv_id = session.get("conversation_id")`. If `transcript.jsonl` exists, set initial `last_line = len(t_file.read_text(encoding="utf-8", errors="ignore").splitlines())` so only *new* lines added during the current run are processed.
2. In `check_capacity(self, session)`:
   Prune runs marked `"running"` if their task in `self.tasks` is already done or cancelled, preventing permanent lockouts after app restart.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/run_backend_tests.py -v`
Expected: PASS

---

### Task 2: Robust Conversation Resumption in `server/application.py` and `server/web/main-v1-adapter.js`

**Files:**
- Modify: `server/application.py:860-875`
- Modify: `server/web/main-v1-adapter.js:338-360,375-400`
- Test: `scripts/run_backend_tests.py`

**Interfaces:**
- Consumes: `payload.conversation_id`, `current.sessionId`, `current.conversationId`
- Produces: Safe creation of sessions with past conversation IDs; updating `current.conversationId` when browsing history.

- [ ] **Step 1: Write test for resuming session with past conversation ID**

Verify that `POST /sessions` with a valid `conversation_id` returns 201 even if `transcript.jsonl` was newly initialized, and returns clean error responses instead of 500 if corrupted.

- [ ] **Step 2: Run test to verify behavior**

Run: `python3 scripts/run_backend_tests.py -v`

- [ ] **Step 3: Update `server/application.py` and `server/web/main-v1-adapter.js`**

1. In `server/application.py`:
   Wrap `transcript_path` check with graceful exception handling (`FileNotFoundError` / `ValueError`) so it doesn't throw unhandled 500.
2. In `server/web/main-v1-adapter.js`:
   In `conversation(id)`: set `current.conversationId = id; persist();` so resuming via drawer synchronizes adapter state immediately.
   In `ensureSession(payload)`: verify `current.sessionId` actually exists on backend before returning early; if dead, reset and create fresh session binding to `payload.conversation_id`.

- [ ] **Step 4: Verify tests pass**

Run: `python3 scripts/run_backend_tests.py -v`
Expected: PASS

---

### Task 3: Complete Update Lifecycle & Permission Handling in `server/web/start-ui.js` and `start.html`

**Files:**
- Modify: `server/web/start-ui.js:180-245`
- Modify: `server/web/start.html:30-40`
- Test: `scripts/run_android_web_asset_tests.py`

**Interfaces:**
- Consumes: `window.AntigravityBridge.canInstallUnknownApps()`, `openInstallPermissionSettings()`, `startUpdateDownload()`, `checkForUpdate()`
- Produces: Responsive UI with install permission warnings, progress updates, disabled button states during download, and `onUpdateDownloadComplete` / `onUpdateDownloadError` handlers.

- [ ] **Step 1: Update `start.html` with install permission alert container**

Add an accessible permission alert container (`#update-permission-box`) in `server/web/start.html` with ARIA live attributes and a button to open unknown app installation settings.

- [ ] **Step 2: Implement full update callbacks and permission checks in `server/web/start-ui.js`**

1. Before starting download, check `canInstallUnknownApps()`. If false, display the permission box and announce instruction to the user.
2. Implement `window.onUpdateDownloadComplete`: announce completion (100%), notify that package installer is opening, and update status text.
3. Implement `window.onUpdateDownloadError`: announce download failure and display the error message.
4. Enhance `window.onUpdateProgress`: update progress bar and status text reliably.

- [ ] **Step 3: Verify syntax and logic**

Run: `node -c server/web/start-ui.js`
Expected: Clean syntax with zero errors.

---

### Task 4: Canonical Web Asset Synchronization

**Files:**
- Run: `scripts/sync_android_web.py`
- Verify: `app/src/main/assets/web/start.html`, `app/src/main/assets/web/start-ui.js`, `app/src/main/assets/web/main-v1-adapter.js`

- [ ] **Step 1: Execute asset synchronization script**

Run: `python3 scripts/sync_android_web.py`
Expected: Assets mirrored with MD5 hashes matching.

- [ ] **Step 2: Check asset parity**

Run: `python3 scripts/sync_android_web.py --check`
Expected: All files synchronized and verified.

---

### Task 5: End-to-End Regression Testing & Verification Gate

**Files:**
- Execute: `scripts/run_backend_tests.py`, `scripts/phase1_preflight.py`, `scripts/test_code_map_integrity.py`

- [ ] **Step 1: Run code map integrity test**

Run: `python3 scripts/test_code_map_integrity.py`
Expected: PASS

- [ ] **Step 2: Run CLI and HTTP preflight tests**

Run: `python3 scripts/phase1_preflight.py`
Expected: PASS

- [ ] **Step 3: Run full backend test suite**

Run: `python3 scripts/run_backend_tests.py -v`
Expected: PASS (100% test pass rate)
