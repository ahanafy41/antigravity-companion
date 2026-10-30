---
date: 2026-10-30
mode: repo
status: draft
decided: null
---

# Conversation Lifecycle, Transparent Tool Telemetry, and Resilient History Management

## Context

In the Antigravity Companion app, three persistent operational and accessibility challenges degrade user trust and reliability:

1. **Cold-Start Desynchronization (Silent Session Contamination)**:
   When launching the app or opening the WebUI, the chat window displays an empty starter feed. However, the client adapter (`main-v1-adapter.js`) and server maintain a background reference to the previous active session. When the user types a prompt thinking it's a clean new session, the system attaches the request to the previous conversation without warning, polluting prior work and confusing the user.
2. **Opaque Agent Stalls & Missing Tool Telemetry**:
   When recovering past conversations or dealing with runs that stalled, crashed, or completed tool execution without generating response text, the app renders an empty message or generic "لا يوجد رد". The executed tools (`read_file`, `run_command`, `write_file`, etc.), file modifications, command outputs, and step progress are completely discarded during transcript rehydration.
3. **Fragmented & Inaccessible Conversation Drawer**:
   In the history drawer dialog (`#conversations-dialog`), each conversation item separates title, metadata, and resume triggers into disparate elements, forcing multiple tab stops on screen readers (TalkBack / Jieshuo). Furthermore, users lack essential management primitives: there are no options to rename conversations, pin priority conversations to the top, or delete unwanted sessions.

This system design establishes an accessible, high-performance, battery-friendly architecture specifically engineered for Android Termux and screen readers.

## Architectural Debt

- **DEBT-01: Session State Desynchronization** (Severity: `high`, Category: `state-synchronization`):
  `main-v1-adapter.js` retains session state in `sessionStorage` independently from `main-ui.js` active conversation tracking, allowing the UI to present a blank chat while the adapter routes prompts into a previous conversation.
- **DEBT-02: Lossy Transcript Parsing** (Severity: `medium`, Category: `observability`):
  `legacy_conversations.py`'s `transcript()` discards tool call details and outputs, reducing them to an opaque integer `tool_count`. Resumed and stalled runs become completely blind.
- **DEBT-03: Inaccessible Split-Button List Item** (Severity: `medium`, Category: `accessibility`):
  `conv-card-item` in `main-ui.js` splits the conversation title and resume button into separate elements, forcing screen readers through redundant non-interactive text nodes.
- **DEBT-04: Missing Mutation Primitives** (Severity: `low`, Category: `api-completeness`):
  No mutation endpoints exist for conversations: users cannot rename, pin, or delete conversation archives.

## Requirements

### Functional Requirements
- **FR-1 (Deterministic Startup & Hydration)**: On cold boot, if an active conversation exists, the UI must visibly load all historical messages, tool cards, and title in the chat feed, announcing the active conversation via `aria-live`. If the user initiates a new chat, the backend session must be explicitly severed.
- **FR-2 (Transparent Tool Telemetry)**: Legacy transcript parsing and live streaming must extract complete tool call metadata (tool name, arguments summary, execution status, and preview output). Turns ending without text (due to crash, timeout, or tool completion) must render structured accessible Tool Cards and an explicit terminal status banner instead of "لا يوجد رد".
- **FR-3 (Unified Accessible List Item)**: Replace fragmented card elements with a single cohesive interactive button (single-tap resume) that opens the conversation and closes the drawer with a single screen reader focus target.
- **FR-4 (Contextual Options: Rename, Pin, Delete)**: Beside each conversation card, provide an accessible Options Menu button exposing:
  1. **Rename (إعادة تسمية)**: Prompt dialog saving custom title.
  2. **Pin (تثبيت المحادثة)**: Toggles sticky top placement.
  3. **Delete (حذف المحادثة)**: Confirmation modal permanently deleting brain folder and cache.
- **FR-5 (Persistent Metadata Ledger)**: Maintain a lightweight JSON metadata ledger on the server and IndexedDB cache to store custom titles, pin timestamps, and soft-deleted records without touching read-only CLI transcript files.

### Non-Functional Requirements
- **NFR-1 (Screen Reader Navigation)**: Zero redundant focus stops in conversation items; context menus use native dialog / ARIA menu patterns with keyboard Esc support.
- **NFR-2 (Hydration Latency)**: Cold-start conversation rehydration must complete within < 150 ms on Android Termux for transcripts under 100 turns.
- **NFR-3 (Resource Bounds)**: Memory delta strictly < 2.5 MB on Termux. Zero additional native dependencies.

## Core Entities and Invariants

- **`ConversationMetadata`**:
  - Invariant 1: Custom titles and pinned states are persisted in `server/data/conversation_metadata.json`.
  - Invariant 2: CLI transcripts in `~/.gemini/antigravity-cli/brain/` remain strictly immutable and read-only.
- **`HydratedTurn`**:
  - Invariant 1: Every turn carries an array of `tools: [ToolExecutionRecord]`.
  - Invariant 2: If `text` is empty and tools were called, `terminal_status` must explicitly distinguish between `completed_tools`, `interrupted_in_tools`, or `error`.
- **`UnifiedConversationCard`**:
  - Invariant 1: The card presents exactly two focusable interactive elements: the Primary Resume Button and the Options Menu Button.
  - Invariant 2: Pinned conversations always sort above unpinned conversations regardless of modification time.

## Architectural Candidates

### Architecture 1: Unified Metadata Ledger & Deep Turn Telemetry (Recommended)
- **Pattern**: Hybrid Server-Ledger + WebUI Hydration.
- **Mechanism**: Dedicated JSON metadata ledger on Termux (`conversation_metadata.json`) with an IndexedDB mirror in the client. Extends `LegacyConversations.transcript()` to correlate `PLANNER_RESPONSE` tool calls with tool results, populating structured tool records. WebUI provides unified card buttons with an accessible 3-action options modal.
- **Strengths**: High durability across browser cache clearing, zero native database dependencies, lightweight memory footprint (< 1 MB), optimal screen reader ergonomics.
- **Weaknesses**: Requires synchronization between server ledger and client IndexedDB cache on updates.

### Architecture 2: Client-Only IndexedDB Overlay
- **Pattern**: Client-Centric Metadata Store.
- **Mechanism**: Store custom titles and pins solely inside browser IndexedDB.
- **Weaknesses**: Clearing browser cache or private mode wipes all custom titles and pins; client cannot delete underlying files on disk.

### Architecture 3: Full SQLite Central Engine
- **Pattern**: Relational Central Store.
- **Mechanism**: Move all conversation metadata and transcripts into a SQLite database with WAL mode.
- **Weaknesses**: Complex migration, locks contention on Termux with concurrent subagents.

## Decided Architecture & Recommendation

**Architecture 1** is recommended. It directly discharges all constraints:
1. **Termux Efficiency**: Avoids SQLite locking and heavy native dependencies.
2. **Screen Reader First**: Eliminates redundant focus stops and wraps options in standard accessible dialogs.
3. **Forensic Transparency**: Resurrects tool calls and execution traces in interrupted conversations.
4. **Zero Stealth Sessions**: Guarantees synchronous alignment between UI display and backend runtime.
