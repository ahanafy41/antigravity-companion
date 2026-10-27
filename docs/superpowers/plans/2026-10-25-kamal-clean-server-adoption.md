# Kamal Clean Architecture Server Adoption & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize, polish, and fully adopt Kamal's modular Clean Architecture (`aiohttp`) server so that it achieves 100% feature parity with the stable dual-engine server, recovers all conversation transcripts, live thinking blocks, tool cards, and artifacts, and seamlessly integrates with the installed Android Companion APK.

**Architecture:** Maintain the modular multi-file architecture (`application.py`, `sessions.py`, `cli_catalog.py`, `legacy_conversations.py`) while grafting the proven fidelity engines from the monolithic server (JSONL transcript reconstruction, live SSE thinking/tool event bus, accessible Artifacts viewer, Claude `--effort` guard, and dedicated `start.html` dashboard navigation).

**Tech Stack:** Python 3 (aiohttp, asyncio, pydantic), Vanilla JS / W3C WAI-ARIA 1.3 (WCAG 2.2 AAA), HTML5 / CSS3, Android WebView Bridge (AntigravityJsBridge).

**Spec:** [docs/lean-companion-architecture-rfc.md](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/docs/lean-companion-architecture-rfc.md) and [project_spec.json](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/project_spec.json).

## Global Constraints

- Must run on port 7681 without binding conflicts or race conditions.
- Strict WCAG 2.2 AAA accessibility compliance: zero decorative emoji clutter in speech announcements, explicit `role` attributes, `aria-live` containers, and full keyboard focus management.
- Complete 1:1 message fidelity with `~/.gemini/antigravity-cli/brain/*/transcript.jsonl`.
- Never send `--effort` to Anthropic Claude models or models without extended thinking support.
- All 51 backend unit tests in `scripts/run_backend_tests.py` must pass at every stage.

## Review Focus

1. **Transcript parser on empty or malformed JSONL lines:** Expected: Skip corrupt line without aborting or dropping subsequent valid turns.
2. **Claude model selection with active effort setting:** Expected: Automatically omit `--effort` parameter during `agy` execution and disable effort picker in UI.
3. **Artifact path traversal attempt outside brain directory:** Expected: Reject path containing `..` or leading `/` with HTTP 403 / 400.
4. **Android back button inside WebView chat:** Expected: Navigate back to `start.html` dashboard without closing the application or losing session state.
5. **Interactive tool permission timeout / disconnect:** Expected: Keep process safely paused or cancel with clear status, avoiding zombie processes.

---

### Task 1: High-Fidelity Transcript Reconstruction & Conversation History (`server/legacy_conversations.py`)

**Files:**
- Modify: `server/legacy_conversations.py:1-250`
- Test: `tests/test_transcript_parity.py` (New test file)

**Interfaces:**
- Consumes: `~/.gemini/antigravity-cli/brain/<cid>/.system_generated/logs/transcript.jsonl`
- Produces: `LegacyConversations.get_conversation_turns(cid: str) -> list[dict]` containing normalized objects:
  `{"role": "user"|"assistant", "text": str, "thinking": str, "tool_calls": list, "timestamp": str}`

- [ ] **Step 1: Write the failing test for transcript turn reconstruction**

Create `tests/test_transcript_parity.py` verifying that:
1. Multi-step turns with `USER_INPUT`, `PLANNER_RESPONSE` (with thinking and tool calls), and tool execution results are reconstructed into clear 1-to-1 user/assistant message pairs.
2. Malformed non-dict JSON lines are skipped gracefully without dropping the conversation.
3. Raw UUIDs in titles are replaced with clean first-prompt titles.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_transcript_parity.py -v`
Expected: FAIL (module or method not matching full signature)

- [ ] **Step 3: Implement robust parser in `server/legacy_conversations.py`**

Update `LegacyConversations` to parse:
- `step["type"] == "USER_INPUT"` -> `role: "user"`
- `step["type"] == "PLANNER_RESPONSE"` -> extract `thinking`, `tool_calls`, and text response into `role: "assistant"`.
- Clean title normalization extracting the first sentence of the initial user input.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests/test_transcript_parity.py -v`
Expected: PASS (all tests pass)

- [ ] **Step 5: Commit**

```bash
git add server/legacy_conversations.py tests/test_transcript_parity.py
git commit -m "feat(conversations): implement full-fidelity transcript turn reconstruction"
```

---

### Task 2: Live SSE Event Stream for Thinking & Tool Execution (`server/application.py` & `server/web/`)

**Files:**
- Modify: `server/application.py:1200-1350`
- Modify: `server/web/main-ui.js:2100-2300`
- Modify: `server/web/main-v1-adapter.js:400-550`
- Test: `tests/test_stream_events.py`

**Interfaces:**
- Consumes: Real-time process stdout / active transcript poller.
- Produces: Server-Sent Events with types:
  - `event: thinking_delta` with payload `{"chunk": str}`
  - `event: tool_call` with payload `{"name": str, "args": dict}`
  - `event: tool_result` with payload `{"name": str, "output": str, "status": "ok"|"error"}`

- [ ] **Step 1: Write failing test for thinking and tool SSE emission**

Create `tests/test_stream_events.py` asserting that streaming a session emits structured `thinking_delta` and `tool_call` events alongside text deltas.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_stream_events.py -v`
Expected: FAIL

- [ ] **Step 3: Update `server/application.py` streaming generator**

Connect transcript poller in `stream_session()` to detect incremental thinking blocks and tool calls, yielding SSE-formatted frames `event: thinking_delta\ndata: ...\n\n`.

- [ ] **Step 4: Update `server/web/main-ui.js` & `main-v1-adapter.js` to render accessible accordions**

Add handler for `thinking_delta` populating `<details class="thinking-accordion"><summary>تفكير الوكيل</summary><div class="thinking-content">...</div></details>`.
Add handler for `tool_call` and `tool_result` populating `<details class="step-output-details"><summary class="step-output-summary">...`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m unittest tests/test_stream_events.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/application.py server/web/main-ui.js server/web/main-v1-adapter.js tests/test_stream_events.py
git commit -m "feat(streaming): wire live thinking accordion and tool output SSE events"
```

---

### Task 3: Accessible Artifacts Engine & Modal Dialog (`server/application.py` & `server/web/`)

**Files:**
- Modify: `server/application.py:900-980`
- Modify: `server/web/main-ui.js:1400-1550`
- Modify: `server/web/main-ui.css:600-680`
- Test: `tests/test_artifacts_api.py`

**Interfaces:**
- Consumes: Files in `<appDataDir>/brain/<cid>/*.md`
- Produces:
  - `GET /api/ai/artifacts/list?cid=<cid>` -> `{"status": "ok", "artifacts": [{"filename": str, "title": str, "size": int, "mtime": float}]}`
  - `GET /api/ai/artifacts/content?cid=<cid>&file=<filename>` -> `{"status": "ok", "filename": str, "content": str, "rendered_html": str}`

- [ ] **Step 1: Write failing test for artifacts API**

Create `tests/test_artifacts_api.py` asserting valid artifact discovery, metadata extraction, and rejection of traversal attempts (`../../etc/passwd`).

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_artifacts_api.py -v`
Expected: FAIL

- [ ] **Step 3: Implement artifacts handlers in `server/application.py`**

Register routes `/api/ai/artifacts/list` and `/api/ai/artifacts/content` with strict path validation (`Path(target).resolve().is_relative_to(brain_dir)`).

- [ ] **Step 4: Integrate Artifacts button and viewer dialog in `server/web/main-ui.js`**

Add header button `btn-header-artifacts` ("📄 المستندات") with dynamic badge count.
Add accessible modal dialog (`#artifacts-modal`) with `role="dialog"`, `aria-modal="true"`, focus trap, and Escape key dismissal.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m unittest tests/test_artifacts_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/application.py server/web/main-ui.js server/web/main-ui.css tests/test_artifacts_api.py
git commit -m "feat(artifacts): implement full accessible artifacts viewer and discovery API"
```

---

### Task 4: Model Matrix & Claude `--effort` Safeguard (`server/cli_settings.py` & `server/sessions.py`)

**Files:**
- Modify: `server/cli_settings.py:120-180`
- Modify: `server/sessions.py:220-270`
- Modify: `server/web/main-ui.js:900-950`
- Test: `tests/test_claude_effort_guard.py`

**Interfaces:**
- Produces: `CLISettings.filter_cli_flags(model: str, effort: str) -> list[str]` which excludes `--effort` when `model` does not support extended reasoning.

- [ ] **Step 1: Write failing test for Claude effort omission**

Create `tests/test_claude_effort_guard.py` checking that selecting `claude-3-5-sonnet` or `claude-3-7-sonnet` returns command args without `--effort`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_claude_effort_guard.py -v`
Expected: FAIL

- [ ] **Step 3: Implement capabilities filter in `server/cli_settings.py` and `server/sessions.py`**

Define `MODELS_SUPPORTING_EFFORT = {"gemini-3.8-flash-high", "gemini-3.8-pro", ...}`.
In command assembly, only append `["--effort", effort]` if model is in the whitelist.

- [ ] **Step 4: Update `server/web/main-ui.js` model selector change listener**

When user selects a Claude model, set `#select-effort` disabled and update aria-label to announce "خاصية التفكير غير مدعومة لهذا النموذج".

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m unittest tests/test_claude_effort_guard.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/cli_settings.py server/sessions.py server/web/main-ui.js tests/test_claude_effort_guard.py
git commit -m "fix(models): enforce strict Claude --effort flag exclusion"
```

---

### Task 5: Interactive Tool Permission Gatekeeper Card (`server/sessions.py` & `server/web/`)

**Files:**
- Modify: `server/sessions.py:450-520`
- Modify: `server/web/main-ui.js:2500-2650`
- Modify: `server/web/main-ui.css:700-760`
- Test: `tests/test_tool_permission_gatekeeper.py`

**Interfaces:**
- Produces: `POST /api/v1/sessions/{id}/permissions` with payload `{"decision": "allow"|"deny", "remember": bool}`.

- [ ] **Step 1: Write failing test for permission pause and resolution**

Create `tests/test_tool_permission_gatekeeper.py` asserting that when process outputs permission challenge, session enters `waiting_permission` state and resumes upon `allow` decision.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_tool_permission_gatekeeper.py -v`
Expected: FAIL

- [ ] **Step 3: Implement permission card in `server/web/main-ui.js`**

Render accessible permission prompt with:
- Warning message and command preview (`pre` block with code style).
- Accessible buttons: "سماح (Allow)" and "منع (Deny)".
- `aria-live="assertive"` announcement for TalkBack / Jieshuo.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m unittest tests/test_tool_permission_gatekeeper.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/sessions.py server/web/main-ui.js server/web/main-ui.css tests/test_tool_permission_gatekeeper.py
git commit -m "feat(permissions): enhance accessible interactive permission dialog"
```

---

### Task 6: Dedicated Dashboard (`start.html`) Navigation & APK Integration (`server/server.py` & `server/application.py`)

**Files:**
- Modify: `server/server.py:80-140`
- Modify: `server/application.py:200-260`
- Modify: `server/web/main-ui.js:120-160`
- Test: `tests/test_dashboard_routes.py`

**Interfaces:**
- Produces: Route `/start` and `/dashboard` serving `server/web/start.html` with HTTP 200.

- [ ] **Step 1: Write failing test for `/start` and `/dashboard` routing**

Create `tests/test_dashboard_routes.py` checking that requesting `http://127.0.0.1:7681/start` and `/dashboard` returns the accessible dashboard HTML.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m unittest tests/test_dashboard_routes.py -v`
Expected: FAIL

- [ ] **Step 3: Add route handlers in `server/application.py`**

Register static file handler for `start.html` on paths `/start`, `/dashboard`, and `/start.html`.

- [ ] **Step 4: Add "الرئيسية" return button in `server/web/main-ui.js` header**

Add `btn-header-dashboard` calling `window.AntigravityBridge.loadDashboardUrl()` if available on Android, falling back to `window.location.href = '/start'`.

- [ ] **Step 5: Run test to verify it passes**

Run: `python3 -m unittest tests/test_dashboard_routes.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/application.py server/web/main-ui.js tests/test_dashboard_routes.py
git commit -m "feat(navigation): restore dedicated start dashboard routing and header button"
```

---

### Task 7: Production Daemonization & Verification Gate (`launch_server.sh` & Test Suite)

**Files:**
- Modify: `server/launch_server.sh`
- Create: `scripts/verify_clean_server.sh`
- Test: `scripts/run_backend_tests.py`

- [ ] **Step 1: Update `server/launch_server.sh` for robust daemonization**

Add `setsid -f` detachment, PID file management in `server.pid`, and active port 7681 readiness polling.

- [ ] **Step 2: Run complete backend test suite (51+ tests)**

Run: `python3 scripts/run_backend_tests.py`
Expected: 100% PASS (51 passed, 0 failed).

- [ ] **Step 3: Run full synchronization to Android assets**

Run: `python3 scripts/sync_android_web.py`
Expected: Assets synchronized cleanly without drift.

- [ ] **Step 4: Update deployment script `~/switch_to_kamal.sh`**

Ensure `~/switch_to_kamal.sh` deploys the verified, hardened modular files and boots smoothly on port 7681.

- [ ] **Step 5: Commit**

```bash
git add server/launch_server.sh scripts/sync_android_web.py
git commit -m "chore(release): finalize production daemonization and sync for clean server"
```
