---
date: 2026-10-29
mode: repo
status: draft
decided: null
---

# Subagent Telemetry, Observability, and Interactive Chat Tracking

## Context

In the Antigravity Lean Companion application, multi-agent operations and subagent invocations (`invoke_subagent`) suffer from severe observability blindspots:
1. Subagent names, roles, and prompts are lost due to a mismatch between Antigravity tool calling parameters (`Role`, `TypeName`, `Prompt` at the top level) and the companion codebase expecting an array property `params.Subagents`.
2. As a consequence, active subagent counts remain `0`, the subagents team room dialog (`#subagents-dialog`) remains empty, and screen readers announce blank agent names.
3. More critically, the rich inner activities of autonomous subagents (web searches, reading files, executing shell commands, and their outputs) run in detached child directories under `~/.gemini/antigravity-cli/brain/<subagent_cid>/` and are completely unobserved by the parent turn's poller and UI.
4. When resuming past conversations from `/api/ai/conversation?id=<cid>`, subagents are completely absent from the restored message history.

This design establishes an accessible, high-performance, battery-friendly hierarchical telemetry architecture specifically optimized for Android Termux and screen readers (TalkBack & CSR).

## Architectural Debt

- **dbt-fragile-parameter-mapping--main-ui-sessions** (Severity: `blocking`, Confidence: `high`):
  Subagent invocation parameters look for `params.Subagents` array instead of direct top-level `Role`/`TypeName`/`Prompt` fields in `server/web/main-ui.js` (lines 877, 1673) and `server/sessions.py` (line 62). Subagents display as generic "وكيل جديد" or fail to register. Remedy: Extract top-level parameters directly with fallback.
- **dbt-unmonitored-child-transcripts--sessions-poller** (Severity: `blocking`, Confidence: `high`):
  `server/sessions.py`'s `_drain_transcript` only inspects the parent conversation transcript, ignoring child subagent transcripts written under `brain/<subagent_cid>/`. Subagent activities remain completely hidden. Remedy: Introduce dual-cursor child transcript tracking during parent execution.

## Requirements

### Functional Requirements
- **FR-1 (Subagent Identity & Telemetry)**: Correctly extract `Role`, `TypeName`, and `Prompt` parameters from `invoke_subagent` calls, populating active agent counters, drawer badges, and the subagents team room.
- **FR-2 (Deep Subagent Execution Observability)**: Capture and stream inner child tool calls (`search_web`, `view_file`/`read_file`, `run_command`, `send_message`) and their outputs directly from child transcripts.
- **FR-3 (In-Chat Subagent Thread & Cards)**: Embed live and historical subagent progress directly inside the conversation turn feed with collapsible accordions matching the main chat's humanized tool cards (`renderToolResultCard`).
- **FR-4 (Accessible Screen-Reader Telemetry)**: Announce subagent launches, tool activities, and completions via ARIA live regions and semantic badges without visual-only dependencies, strictly respecting TalkBack and Jieshuo (CSR).
- **FR-5 (Full Historical Recovery)**: When resuming past conversations, auto-discover all child subagent transcripts and restore the complete multi-agent activity stream in the chat feed and team dialog.

### Non-Functional Requirements
- **NFR-1 (Latency)**: UI renders subagent tool steps within < 1000 ms of being written to `transcript.jsonl`.
- **NFR-2 (Resource Bounds)**: Termux process memory strictly under 80 MB, 2 CPU threads max (`GOMAXPROCS=2`), with a 16 KB output buffer preview cap per step to prevent mobile WebView freezes.
- **NFR-3 (Accessibility Standards)**: 100% WCAG 2.2 AA compliance; clear Arabic labels; zero unannounced dynamic states.

## Core Entities and Invariants

- **`SubagentInstance`**:
  - Invariant 1: `conversationId` must be a valid 36-char UUID or 32-char hex string.
  - Invariant 2: Transcripts are strictly append-only files at `~/.gemini/antigravity-cli/brain/<cid>/.system_generated/logs/transcript.jsonl`.
  - Invariant 3: Subagent lifecycle transitions cleanly (`ACTIVE` -> `DONE` or `ERROR`).
- **`SubagentToolStep`**:
  - Invariant 1: Output preview strictly capped at 16 KB.
  - Invariant 2: Step belongs to exactly one subagent instance and preserves sequence order.

## Data and Consistency Model

- **Ordering Authority**: Each subagent transcript maintains its own local sequential line index (`step_index`).
- **Durability Point**: Flushed to disk by the CLI process in `transcript.jsonl`.
- **Read-Only Observer**: Companion server acts as an asynchronous read-only observer using cursor line offsets, ensuring zero risk of transcript corruption.

## Database Schemas

- **Store**: Local JSONL Transcript (`~/.gemini/antigravity-cli/brain/<cid>/.system_generated/logs/transcript.jsonl`)
- **Fields**:
  - `conversationId` (UUID, partition key)
  - `step_index` (int, sort key)
  - `type` (string: `PLANNER_RESPONSE`, `GENERIC`, `TOOL_RESULT`)
  - `tool_name` (string)
  - `parameters` (object)
  - `content` / `output` (string, max 16 KB preview)

## System Interfaces

1. **Subagent Telemetry Stream Event**:
   - `GET /sessions/{session_id}/runs/{run_id}/stream` (SSE text/event-stream)
   - Delivers real-time tool events for both parent agent and child subagents.
2. **Conversation Detail with Nested Subagents**:
   - `GET /api/ai/conversation?id={conv_id}` (REST HTTP JSON)
   - Returns restored turns with populated `subagents` array containing child runs and tool records.

## Estimates

- **Polling overhead**: 2-5 ms per tick on local flash storage.
- **Memory footprint per active subagent tracker**: < 12 KB RAM in server state.
- **Payload size per tool event**: 1 - 16 KB bounded preview.

## Candidates

### Architecture 0 (Current Baseline)
- Single-level poller on parent directory only.
- Broken `params.Subagents` array lookup.
- Subagents invisible in chat; team room dialog empty.
- **Rating**: Simplicity 3/5, Scalability 2/5, Fault Tolerance 2/5.

### Architecture A (Hierarchical Dual-Cursor Telemetry - Recommended)
- Correlates parent `invoke_subagent` calls with child conversation IDs.
- Concurrent cursor-based polling across parent and child transcripts in `server/sessions.py`.
- Emits hierarchical tool steps over SSE stream.
- Frontend renders dedicated, accessible `SubagentThreadCard` in chat feed, matching `renderToolResultCard`.
- `server/legacy_conversations.py` automatically resolves child transcripts on conversation restore.
- **Rating**: Simplicity 5/5, Scalability 4/5, Fault Tolerance 5/5, Performance 4/5, Modularity 4/5, Cost 5/5.

### Architecture B (Client-Side REST Polling)
- Frontend independently polls `/api/ai/subagents/{cid}` every 1s.
- Rejected: Battery drain from frequent HTTP round-trips on Android; race conditions between parent and child chat messages.
- **Rating**: Simplicity 2/5, Scalability 3/5, Performance 2/5.

## Comparison and Recommendation

We strongly recommend **Architecture A**:
1. **Battery & Performance**: Dual-cursor polling occurs inside the existing 500 ms async loop in `server/sessions.py` without extra HTTP round-trips or client polling.
2. **Accessibility**: Subagent status changes and tool actions are announced seamlessly to TalkBack and Jieshuo (CSR) in authentic Arabic without lag.
3. **Simplicity & Safety**: Pure read-only inspection of disk transcripts with zero risk to AGY CLI internals.

## Critical Deep Dives

1. **Dual-Cursor Hierarchical Poller**:
   - Manages a dictionary of `{cid: {"cursor": int, "role": str, "type": str}}`.
   - On detecting `invoke_subagent` result in parent transcript (which returns `{ "conversationId": "<cid>" }`), registers child `<cid>`.
   - Reads newly appended lines in child `transcript.jsonl`, extracting tool calls and outputs.
2. **In-Place Chat Thread Rendering**:
   - A dedicated `SubagentThreadCard` in `server/web/main-ui.js` contains a summary header with role, type, state badge, and an expandable tools list.
   - Child tool outputs (`search_web`, `view_file`, `run_command`) render using the exact same rich tool cards as parent tools.
3. **WebView Memory Safeguards**:
   - Previews truncated to 16 KB with clear copy buttons.

## Operations and Rollout

- **Rollout**: Staged non-breaking upgrade in `server/sessions.py`, `server/legacy_conversations.py`, and `server/web/main-ui.js`.
- **Validation**: Full automated test suite verification (`run_ui_tests.cjs`, `run_backend_tests.py`, `run_tests.py`).

## Risks and What Breaks First

- **Rapid Parallel Writes**: If 4+ subagents write gigabytes of logs simultaneously, disk I/O could briefly delay SSE delivery. Mitigated by asynchronous non-blocking reads and cursor line limits.

## Measurements That Could Overturn the Decision

- If subagent transcript polling exceeds 30 ms per tick on low-end Android devices, switch from 500 ms polling to notification-driven wakes.

## Next Steps

1. Update `server/sessions.py` to fix parameter parsing and add child transcript polling in `_drain_transcript`.
2. Update `server/legacy_conversations.py` to auto-populate nested subagents and tool steps on conversation resume.
3. Update `server/web/main-ui.js` to render live subagent cards, update the Subagent Team Room, and trigger ARIA live announcements.
4. Run all verification test suites and verify 100% pass.

## Notes

