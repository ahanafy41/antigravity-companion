# Subagent Telemetry, Observability, and Interactive Chat Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish end-to-end telemetry and observability for autonomous subagents in the Antigravity Companion app, including parameter normalization, hierarchical dual-cursor transcript polling in the server, full historical multi-agent recovery, and accessible in-chat subagent cards with humanized outputs.

**Architecture:** Extend `server/sessions.py` to concurrently track and poll child subagent transcripts during parent runs via cursor indexing; enhance `server/legacy_conversations.py` to restore child multi-agent histories upon conversation resume; and update `server/web/main-ui.js` and `server/web/main-v1-adapter.js` to render subagent identity, counts, ARIA announcements, and humanized tool output cards directly in the chat feed.

**Tech Stack:** Python 3 (asyncio, aiohttp, unittest), Vanilla JavaScript (ES6, Web Components, DOM APIs), JSONL streaming transcripts.

**Spec:** [`docs/design/subagent-telemetry-and-tracking/DESIGN.md`](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/docs/design/subagent-telemetry-and-tracking/DESIGN.md)

## Global Constraints

- Android Termux resource limits: server memory must remain under 80 MB, 2 CPU threads max.
- Screen reader first: TalkBack and Jieshuo (CSR) must announce subagent identity, actions, and completion clearly via ARIA live regions without emoji noise or wide tables.
- Zero disk transcript corruption: CLI transcripts in `~/.gemini/antigravity-cli/brain/` are strictly read-only append-only.
- Tool output bounds: previews strictly bounded to 16 KB (`MAX_TOOL_OUTPUT = 16384`) to prevent EventLog buffer overflows, SSE disconnects, and WebView freezes.
- 100% backward compatibility and test passes across existing test suites (`scripts/run_task_tests.py`, `scripts/run_backend_tests.py`, `scripts/run_parity_tests.py`).

## Review Focus

1. Subagent parameter shapes: `invoke_subagent` parameters may supply `Role`, `TypeName`, `Prompt` directly at the top level or via legacy `Subagents` array. Both must be handled cleanly without crashing.
2. Missing or delayed child transcript: When `invoke_subagent` produces a `conversationId`, the child directory or `transcript.jsonl` may not exist on disk immediately; polling must handle `FileNotFoundError` gracefully and retry on the next tick.
3. Concurrent multiple subagents: A single parent turn may launch multiple subagents (e.g. 2-4 subagents in parallel). Each child transcript must maintain an independent line cursor.
4. Output memory bounding: Child tool outputs exceeding 16 KB must be truncated with a clear ellipsis notice, preserving UI responsiveness.
5. Historical conversation resume: Resuming past conversations with subagents must not fail or hang if a child transcript was partially deleted or corrupted.

---

### Task 1: Subagent Parameter Parsing & Identity Normalization

**Files:**
- Modify: `server/sessions.py:61-73`
- Modify: `server/task_runtime.py:47-80`
- Test: `scripts/run_task_tests.py`

- [ ] **Step 1: Write failing test in `scripts/run_task_tests.py`**
  Add `test_invoke_subagent_top_level_parameters_and_permissions` verifying that `invoke_subagent` with top-level `Role`, `TypeName`, `Prompt` extracts role and prompt correctly in permission prompts and task runtime observation.
- [ ] **Step 2: Run test to confirm failure**
  Run `python3 -m unittest scripts/run_task_tests.py -k test_invoke_subagent_top_level_parameters_and_permissions` and confirm it fails or highlights missing behavior.
- [ ] **Step 3: Update `server/sessions.py` permission & tool labeling**
  In `prompt_permission` (line 61), extract `Role`, `TypeName`, and `Prompt` from `params` top-level first, falling back to `params.get("Subagents", [])`.
- [ ] **Step 4: Update `server/task_runtime.py` subagent observation**
  In `observe`, allow extracting subagents from step parameters or event details when top-level fields are passed.
- [ ] **Step 5: Run tests and confirm pass**
  Run `python3 scripts/run_task_tests.py` and verify all tests pass.
- [ ] **Step 6: Commit changes**
  Commit with message `feat(server): normalize invoke_subagent top-level parameters and permissions`.

---

### Task 2: Hierarchical Child Transcript Poller in `server/sessions.py`

**Files:**
- Modify: `server/sessions.py:685-820`
- Test: `scripts/run_task_tests.py`

- [ ] **Step 1: Write failing test in `scripts/run_task_tests.py`**
  Add `test_hierarchical_child_transcript_polling` that simulates a parent run where a tool call generates a child `conversationId`, creates a mock child `transcript.jsonl` with child tool calls (e.g. `search_web`, `view_file`), and asserts that child tool events are emitted with subagent metadata and bounded outputs.
- [ ] **Step 2: Run test to confirm failure**
  Run `python3 -m unittest scripts/run_task_tests.py -k test_hierarchical_child_transcript_polling` and confirm failure.
- [ ] **Step 3: Implement child transcript tracking in `_drain_transcript`**
  - Track `run.setdefault("active_children", {})` mapping `child_cid -> {"cursor": 0, "role": role, "type": type}`.
  - In `_drain_transcript`, when a tool result for `invoke_subagent` contains a `conversationId` (e.g., regex match or JSON parse), register `child_cid`.
  - For each registered child, read new lines in `brain/<child_cid>/.system_generated/logs/transcript.jsonl`.
  - Parse `PLANNER_RESPONSE` for child tool calls and emit tool events carrying `subagent_id`, `subagent_role`, `subagent_type`.
  - Parse `GENERIC` / `TOOL_RESULT` for child tool outputs, capping at 16 KB preview, and emit completed tool events.
  - Detect child finish / message sending.
- [ ] **Step 4: Run tests and confirm pass**
  Run `python3 scripts/run_task_tests.py` and verify all tests pass.
- [ ] **Step 5: Commit changes**
  Commit with message `feat(server): implement hierarchical child transcript polling for subagents`.

---

### Task 3: Historical Multi-Agent Recovery in `server/legacy_conversations.py`

**Files:**
- Modify: `server/legacy_conversations.py:160-220`
- Test: `scripts/run_backend_tests.py`

- [ ] **Step 1: Write failing test in `scripts/run_backend_tests.py`**
  Add `test_legacy_conversation_subagent_history_recovery` that sets up a temporary parent transcript with an `invoke_subagent` call and a child transcript with tools and output, calls `LegacyConversations.transcript(conv_id)`, and verifies that `subagents` list is populated with child turns and tool calls.
- [ ] **Step 2: Run test to confirm failure**
  Run `python3 -m unittest scripts/run_backend_tests.py -k test_legacy_conversation_subagent_history_recovery` and verify failure.
- [ ] **Step 3: Implement subagent discovery in `LegacyConversations.transcript`**
  - While parsing `records` of parent transcript, identify `invoke_subagent` calls and extract child `conversationId`.
  - For each discovered child `conversationId`, read its `transcript.jsonl` (up to safe byte limit).
  - Collect subagent details: `conversation_id`, `role`, `type_name`, `prompt`, `tools` list (with tool names, parameters, outputs), and final message.
  - Attach `subagents` array to returned dictionary in `transcript()`.
- [ ] **Step 4: Run tests and confirm pass**
  Run `python3 scripts/run_backend_tests.py` and verify all tests pass.
- [ ] **Step 5: Commit changes**
  Commit with message `feat(server): restore nested subagent activities in legacy conversation history`.

---

### Task 4: In-Chat Subagent Thread Cards, Live Telemetry & Screen Reader Support

**Files:**
- Modify: `server/web/main-v1-adapter.js:555-575`
- Modify: `server/web/main-ui.js:875-895, 1665-1790, 3620-3690, 5455-5590`
- Modify: `server/web/main-ui.css`
- Assets Sync: `app/src/main/assets/index.html` & `~/.antigravity-server/web/`
- Test: `scripts/sync_android_web.py`, `scripts/run_task_tests.py`

- [ ] **Step 1: Update `server/web/main-v1-adapter.js`**
  Pass `subagent_id`, `subagent_role`, and `subagent_type` from tool events through to UI `tool_step` events.
- [ ] **Step 2: Update `server/web/main-ui.js` parameter extraction & badges**
  - In `getToolLabel`: read `params.Role || params.TypeName || params.Subagents...` and display specific role: "🤖 إطلاق الوكيل الفرعي: [اسم الدور]".
  - In `tool_step` event handler: when `invoke_subagent` triggers, register subagent with `role = params.Role || params.TypeName || ...`, update `#val-subagents-count` and `#val-subagents-count-drawer`, and announce via `announce(...)`.
- [ ] **Step 3: Implement In-Chat Subagent Thread Card in `main-ui.js`**
  - When a tool step arrives with `subagent_id` or `subagent_role`:
    - Check if a `SubagentThreadCard` container exists for this `subagent_id` in the current message turn.
    - If not, create an accessible `<article class="subagent-thread-card" role="region" aria-label="أنشطة الوكيل الفرعي: [الدور]">` containing agent badge, role title, state indicator, and a nested `<ul class="subagent-steps-list">`.
    - Append the tool step inside the subagent's nested list, utilizing `renderToolResultCard` for rich formatted outputs (search results, file view, command outputs).
    - Announce significant subagent tool completions politely to screen readers: `announce("الوكيل الفرعي [الدور]: نفذ [اسم الأداة]")`.
- [ ] **Step 4: Support Subagents in Resumed Conversations**
  - In `resumeConversation`: when `data.subagents` exists, render historical subagent cards in their respective turns with completed states.
- [ ] **Step 5: Style Subagent Thread Cards in `server/web/main-ui.css`**
  Add clean, accessible styling for `.subagent-thread-card` with high-contrast borders, clear focus outlines, and responsive padding.
- [ ] **Step 6: Sync web assets**
  Run `python3 scripts/sync_android_web.py`.
- [ ] **Step 7: Commit changes**
  Commit with message `feat(ui): render accessible in-chat subagent thread cards and live telemetry`.

---

### Task 5: End-to-End Verification & Quality Gate

**Files:**
- Test: All suites (`scripts/run_task_tests.py`, `scripts/run_backend_tests.py`, `scripts/run_parity_tests.py`)

- [ ] **Step 1: Run all backend and task tests**
  Execute `python3 scripts/run_task_tests.py` and `python3 scripts/run_backend_tests.py`. Verify 100% pass.
- [ ] **Step 2: Run parity tests**
  Execute `python3 scripts/run_parity_tests.py`. Verify 100% pass.
- [ ] **Step 3: Verify web asset synchronization**
  Verify that `server/web/` matches `app/src/main/assets/` and `~/.antigravity-server/web/`.
- [ ] **Step 4: Check git status and commit final verification**
  Ensure working directory is clean and all tests succeed.
