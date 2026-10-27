# Design Document: Codebase Architecture Map & Surgical Navigation Guide (CODE_MAP.md)

**Date**: 2026-10-27  
**Status**: Pending Review  
**Project**: Antigravity Companion (`antigravity-companion-app`)  
**Target File**: `CODE_MAP.md` (Repository Root)

---

## 1. Intent and The Why

### The Problem
When developers or autonomous AI agents work on `antigravity-companion-app`, they often execute repetitive shell commands (`find`, `grep`, `cat`, directory listings) to discover where functionality is implemented, what classes exist, and how components interact. This:
1. Burns substantial LLM context tokens and rate limits.
2. Increases latency before any modification can begin.
3. Introduces risk of unintended side-effects and collateral changes across interconnected layers (e.g., editing `server/web/` without syncing to `app/src/main/assets/web/`, or modifying native bridge methods without checking security HMAC proofs).

### The Solution
Produce a comprehensive, single-source-of-truth architectural map and navigation guide in the repository root (`CODE_MAP.md`). Any future session or contributor can read this single document in one shot to immediately know:
- The full architectural topology and data flow between Android, Python/Termux, and `agy` CLI.
- The exact role, symbols, and dependencies of every single file.
- Prescriptive "Modification Playbooks" (step-by-step recipes for the most common feature additions and fixes).
- Strict verification commands to validate changes without guesswork.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Deterministic Navigation**: Locate any feature's implementation within 5 seconds without searching.
- **Accurate Granular Inventory**: Map 100% of production files across `app/`, `server/`, `scripts/`, and root configurations.
- **Action-Oriented Playbooks**: Provide clear step-by-step checklists for frequent maintenance tasks (e.g., adding an API endpoint, tweaking UI, updating OTA release, modifying Termux diagnostics).
- **Screen Reader & AI Agent Optimized**: Pure GitHub Flavored Markdown with logical hierarchies, clear tables/lists, and clickable file references.

### Non-Goals
- Duplicating the full source code inside the document (only roles, signatures, interfaces, and contracts).
- Replacing individual unit test suites (the map points to them; it doesn't replace them).

### Anti-Goals
- Creating scattered, multi-file documentation fragments that require multiple reads across directories (violates the single-read principle).
- Writing vague, high-level summaries that still force the developer to search files for symbol names.

---

## 3. Constraints

1. **Zero External Dependencies**: Must be readable in standard Markdown viewers, terminal pagers, and screen readers (TalkBack / Jieshuo).
2. **Sync Preservation**: Must clearly highlight dual-copy assets (e.g. `server/web/` vs `app/src/main/assets/web/`) and the synchronization command (`python scripts/sync_android_web.py`).
3. **Security Boundaries**: Must document native bridge security policies (`NativeBridgePolicy`, HMAC tokens, Origin checks) so future edits do not compromise local host security.
4. **Maintenance Invariant**: The document must specify a lightweight update rule when new files or endpoints are added.

---

## 4. Approaches Considered

### Approach 1: Centralized Master Map (`CODE_MAP.md`) — [SELECTED]
- **Design**: A single comprehensive document at the repository root covering architecture diagrams, file matrix, and surgical modification playbooks.
- **Trade-offs**: Slightly larger single file (~30–40 KB), but delivers complete context in a single read, eliminating token waste and multi-hop file discovery.
- **Why Selected**: Directly fulfills the user's primary requirement of "not burning context in endless code searches."

### Approach 2: Distributed Hub & Spokes (`app/MAP.md`, `server/MAP.md`, etc.) — [REJECTED]
- **Design**: Minimal root index pointing to sub-maps inside each folder.
- **Trade-offs**: Fragmented context; features spanning both Android and Python require 3+ reads, defeating the one-shot lookup goal.

---

## 5. Detailed Specification of `CODE_MAP.md`

The generated `CODE_MAP.md` will contain the following five structured sections:

### Section 1: System Topology & Cross-Layer Data Flow
- Visual ASCII / Mermaid architecture diagram showing:
  - **Android Client**: `MainActivity` -> `CompanionWebViewClient` -> `WebViewAssetLoader` -> Native Bridge.
  - **Termux IPC**: `TermuxBridge` -> RUN_COMMAND intent / socket probe.
  - **Python Daemon**: `server.py` -> `application.py` -> `sessions.py` -> `cli_client.py` -> `agy` CLI subprocess.
  - **Web Studio**: `main-ui.js` <-> `api.js` <-> Server REST/SSE API (`/api/chat`, `/api/status`, `/api/sessions`).

### Section 2: Component Breakdown & Responsibilities
- **Core Tier 1: Android Native Layer (`app/`)**:
  - Java classes, roles, intent filters, OTA update mechanisms, diagnostic engines.
- **Core Tier 2: Server Runtimes (`server/`)**:
  - Python modules, session lifecycles, MCP probing, authentication & origin verification, CLI streaming.
- **Core Tier 3: Frontend Web Assets (`server/web/` & `app/assets/`)**:
  - UI state management, accessibility ARIA live regions, speech synthesis, settings dialogs.
- **Core Tier 4: Tooling, Packaging & Test Automation (`scripts/`)**:
  - Release packaging (`ReleaseSigner`, `package_release.py`), synchronization (`sync_android_web.py`), and test runners.

### Section 3: File-by-File Matrix (Complete Inventory)
A structured index covering every file in the repository:
| File Path | Component | Core Responsibilities & Symbols | Dependencies / Interacting Files |
|---|---|---|---|
| `app/.../MainActivity.java` | Android UI | Root activity, WebView setup, update checking | `TermuxBridge`, `AppUpdateManager` |
| `server/application.py` | Backend | HTTP routing, request dispatcher, error handling | `server.py`, `sessions.py`, `security.py` |
| `server/sessions.py` | Backend | Chat session state, history storage, locking | `storage.py`, `cli_client.py` |
| ... *(All files cataloged)* | ... | ... | ... |

### Section 4: Surgical Modification Playbooks (كتالوج الوصفات)
Step-by-step recipes mapping exactly which files to edit, which to avoid, and what tests to run for:
1. **Recipe A**: Adding or modifying a Backend REST API endpoint.
2. **Recipe B**: Updating Web UI elements or Chat layout (with asset sync).
3. **Recipe C**: Adding a new Android Native Bridge method (with security proof).
4. **Recipe D**: Changing `agy` CLI interaction flags or model defaults.
5. **Recipe E**: Modifying Termux environment diagnostic checks (`doctor.py` / `DoctorDiagnosticEngine.java`).
6. **Recipe F**: Updating and publishing an in-app OTA release.
7. **Recipe G**: Adding a new backend unit test.
8. **Recipe H**: Modifying MCP server discovery or probing logic.

### Section 5: Verification & Safety Guardrails
- Essential commands to run before committing any change:
  - Code validation: `python -m unittest discover -s scripts`
  - Asset sync check: `python scripts/sync_android_web.py --check`
  - Preflight checks: `python scripts/phase1_preflight.py`
  - Android asset tests: `python scripts/run_android_web_asset_tests.py`

---

## 6. What's Left to the Builder
- Performing AST / symbol inspection on all existing files to record accurate class/function lists.
- Writing the comprehensive `CODE_MAP.md` in pure Markdown adhering to accessibility standards.
- Committing the design doc and map cleanly into git.
