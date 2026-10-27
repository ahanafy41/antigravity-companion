# Codebase Architecture Map (CODE_MAP.md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a comprehensive, deterministic, single-source-of-truth codebase architecture map and surgical navigation guide (`CODE_MAP.md`) at the root of `antigravity-companion-app` to eliminate repetitive code searches and token burn during future modifications.

**Architecture:** A single-file root reference document structured into 5 cohesive tiers: System Topology & Data Flow, Component Breakdown, Granular File-by-File Inventory, 8 Prescriptive Modification Playbooks, and Safety Verification Guardrails. Accompanied by an automated integrity test script (`scripts/test_code_map_integrity.py`) that validates completeness and link validity against the live filesystem using Python standard library.

**Tech Stack:** Python 3.10+ (Standard Library: `unittest`, `pathlib`, `re`), GitHub Flavored Markdown, Mermaid diagrams, Android Java, Bash.

**Spec:** `/data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/docs/superpowers/specs/2026-10-27-codebase-architecture-map-design.md`

## Global Constraints

- Target file must be placed at the repository root: `CODE_MAP.md`.
- Pure GitHub Flavored Markdown adhering strictly to WCAG and screen-reader friendliness (TalkBack / Jieshuo).
- Zero external dependencies: integrity test must run purely on Python standard library (`unittest`).
- Dual-copy asset synchronization between `server/web/` and `app/src/main/assets/web/` must be explicitly documented and tested.
- 100% of production files across `app/src/main/java/`, `server/*.py`, `server/web/`, and `scripts/*.py` must be accounted for in the File Matrix.
- Must preserve attribution and historical context for Ahmed Hanafy and maintainer Kamal Yaser.

## Review Focus

- Missing production files: Any `.java`, `.py`, or `.js` file present in the repo omitted from the map.
- Broken file links: References to non-existent filenames or shifted relative paths.
- Recipe drift: Modification recipes that omit required verification commands or safety boundaries.
- Native security bypass: Documentation failing to enforce HMAC proof tokens on new native bridge actions.
- Desynchronized web assets: Instructions modifying `server/web/` without specifying the sync command (`sync_android_web.py`).

---

### Task 1: Create Automated Map Integrity Test (`scripts/test_code_map_integrity.py`)

**Files:**
- Create: `scripts/test_code_map_integrity.py`
- Test: `scripts/test_code_map_integrity.py`

**Interfaces:**
- Produces: `CodeMapIntegrityTest` suite with methods:
  - `test_code_map_file_exists()`
  - `test_required_sections_present()`
  - `test_all_production_files_indexed()`
  - `test_all_recipes_documented()`
  - `test_verification_commands_present()`

- [ ] **Step 1: Write the failing test**

Write `scripts/test_code_map_integrity.py` testing for:
1. Existence of `CODE_MAP.md` at root.
2. Presence of all 5 mandatory section headers:
   - `## 1. System Topology & Cross-Layer Data Flow`
   - `## 2. Component Breakdown & Responsibilities`
   - `## 3. File-by-File Matrix (Complete Inventory)`
   - `## 4. Surgical Modification Playbooks`
   - `## 5. Verification & Safety Guardrails`
3. Presence of all 8 modification recipes (Recipe A through Recipe H).
4. Coverage of all key files: `MainActivity.java`, `CompanionWebViewClient.java`, `TermuxBridge.java`, `server.py`, `application.py`, `sessions.py`, `cli_client.py`, `main-ui.js`, `sync_android_web.py`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest scripts/test_code_map_integrity.py -v`  
Expected: FAIL with `AssertionError: CODE_MAP.md does not exist at repository root`

- [ ] **Step 3: Implement minimal placeholder `CODE_MAP.md` to establish structure**

Create `CODE_MAP.md` with base title and outline to confirm test runner interaction.

- [ ] **Step 4: Run test to verify expected failure on remaining assertions**

Run: `python -m unittest scripts/test_code_map_integrity.py -v`  
Expected: FAIL with missing sections or files.

- [ ] **Step 5: Commit**

```bash
git add scripts/test_code_map_integrity.py
git commit -m "test: add automated integrity test suite for CODE_MAP.md"
```

---

### Task 2: Implement System Topology & Component Breakdown (Sections 1 & 2)

**Files:**
- Modify: `CODE_MAP.md:1-120`
- Test: `scripts/test_code_map_integrity.py`

**Interfaces:**
- Consumes: Architectural contracts from `docs/superpowers/specs/2026-10-27-codebase-architecture-map-design.md`.
- Produces:
  - Mermaid architecture diagram illustrating Android Native <-> Termux IPC <-> Python Daemon <-> `agy` CLI <-> Web Studio.
  - Core domain breakdown detailing Tier 1 (Android), Tier 2 (Server), Tier 3 (Web), Tier 4 (Tooling & Scripts).

- [ ] **Step 1: Draft Section 1: System Topology & Cross-Layer Data Flow in `CODE_MAP.md`**

Include:
- ASCII / Mermaid sequence diagram for prompt execution: User input -> Web Studio (`main-ui.js`) -> REST `POST /api/chat` (`application.py`) -> Session manager (`sessions.py`) -> CLI worker (`cli_client.py`) -> Google `agy` subprocess -> SSE chunks stream back -> Audio / UI display.
- Termux launch sequence: `MainActivity` -> `TermuxBridge` -> RUN_COMMAND intent -> `launch_server.sh` -> PID recording.
- Native Bridge security flow: Web Javascript -> `window.CompanionNative` -> `NativeBridgePolicy` (HMAC verification) -> Execution.

- [ ] **Step 2: Draft Section 2: Component Breakdown & Responsibilities in `CODE_MAP.md`**

Define exact responsibilities, constraints, and lifecycle for:
- Android Shell (`app/`)
- Python Local Server (`server/`)
- Web Frontend (`server/web/` & `app/src/main/assets/web/`)
- Automation & Tests (`scripts/`)

- [ ] **Step 3: Run integrity tests for Sections 1 & 2**

Run: `python -m unittest scripts/test_code_map_integrity.py -k test_required_sections_present -v`  
Expected: Partial pass or progressing assertion.

- [ ] **Step 4: Commit**

```bash
git add CODE_MAP.md
git commit -m "docs: add system topology and component breakdown to CODE_MAP.md"
```

---

### Task 3: Implement Complete Granular File-by-File Matrix (Section 3)

**Files:**
- Modify: `CODE_MAP.md`
- Test: `scripts/test_code_map_integrity.py`

**Interfaces:**
- Consumes: AST and class introspection of all repository files.
- Produces: Complete inventory table with columns:
  - `Path`
  - `Tier / Domain`
  - `Core Responsibilities & Key Symbols (Classes / Functions)`
  - `Dependencies (Imports / Interacting Files)`

- [ ] **Step 1: Audit and catalog all Android Java files in `app/src/main/java/com/antigravity/companion/`**

Index 18 Java files:
- `MainActivity.java`: UI container, WebView loader, updates.
- `CompanionWebViewClient.java`: URL filtering, local asset handling.
- `TermuxBridge.java`: Termux service checks, RUN_COMMAND dispatch.
- `DoctorDiagnosticEngine.java`: Health checks engine.
- `AppUpdateManager.java`: OTA update checker and trigger.
- `NativeBridgePolicy.java`, `OriginPolicy.java`, `NativeSecrets.java`, `NativeRequestLedger.java`, `NativeProof.java`, `NativeActionArguments.java`: JS bridge security.
- `ServerConnection.java`, `TermuxLaunchContract.java`, `UpdatePolicy.java`, `UpdateCompatibility.java`, `UpdateTransfer.java`, `BootReceiver.java`.

- [ ] **Step 2: Audit and catalog all Python backend files in `server/`**

Index 18 Python modules & shell scripts:
- `server.py`, `application.py`, `sessions.py`, `cli_client.py`, `cli_catalog.py`, `cli_settings.py`, `mcp_probe.py`, `mcp_settings.py`, `runtime_status.py`, `security.py`, `storage.py`, `launcher.py`, `local_tasks.py`, `task_runtime.py`, `voice_agent.py`, `voice_planner.py`, `android_client.py`, `legacy_conversations.py`.

- [ ] **Step 3: Audit and catalog Web assets in `server/web/`**

Index 8 web files:
- `index.html`, `main-ui.js`, `main-ui.css`, `api.js`, `history.js`, `manifest.json`, `sw.js`, `start.html`.

- [ ] **Step 4: Audit and catalog Automation & Maintenance scripts in `scripts/`**

Index 24+ test and tooling scripts:
- `doctor.py`, `sync_android_web.py`, `prepare_web_release.py`, `package_release.py`, `install_release.py`, `ReleaseSigner.java`, `phase1_preflight.py`, `run_backend_tests.py`, `run_tests.py`, etc.

- [ ] **Step 5: Run integrity tests for file indexing**

Run: `python -m unittest scripts/test_code_map_integrity.py -k test_all_production_files_indexed -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add CODE_MAP.md
git commit -m "docs: complete granular file-by-file inventory in CODE_MAP.md"
```

---

### Task 4: Implement Surgical Modification Playbooks (Section 4)

**Files:**
- Modify: `CODE_MAP.md`
- Test: `scripts/test_code_map_integrity.py`

**Interfaces:**
- Produces: 8 self-contained recipes formatted with:
  - **Goal**
  - **Files to Modify**
  - **Files to NEVER Touch (Invariants)**
  - **Step-by-Step Procedure**
  - **Verification Command**

- [ ] **Step 1: Write Recipes A through D**

- **Recipe A**: Adding or modifying a Backend REST API endpoint (`server/application.py`, `server/sessions.py`).
- **Recipe B**: Updating Web UI layout / chat interactions (`server/web/main-ui.js`, `server/web/main-ui.css` + `python scripts/sync_android_web.py`).
- **Recipe C**: Adding a new Android Native Bridge method (`app/.../MainActivity.java`, `NativeBridgePolicy.java`).
- **Recipe D**: Adjusting `agy` CLI interaction flags or model catalogue (`server/cli_client.py`, `server/cli_catalog.py`).

- [ ] **Step 2: Write Recipes E through H**

- **Recipe E**: Modifying Termux environment diagnostic checks (`scripts/doctor.py`, `app/.../DoctorDiagnosticEngine.java`).
- **Recipe F**: Packaging and publishing an in-app OTA release (`app/build.gradle`, `.github/workflows/build-apk.yml`, `project_spec.json`, `scripts/package_release.py`).
- **Recipe G**: Adding a new backend unit test (`scripts/run_backend_tests.py`, `scripts/run_tests.py`).
- **Recipe H**: Modifying MCP server discovery and probe routines (`server/mcp_probe.py`, `server/mcp_settings.py`).

- [ ] **Step 3: Run integrity tests for recipes**

Run: `python -m unittest scripts/test_code_map_integrity.py -k test_all_recipes_documented -v`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add CODE_MAP.md
git commit -m "docs: add 8 surgical modification recipes to CODE_MAP.md"
```

---

### Task 5: Implement Safety Guardrails & Full Suite Verification (Section 5)

**Files:**
- Modify: `CODE_MAP.md`
- Test: `scripts/test_code_map_integrity.py`

**Interfaces:**
- Produces:
  - Section 5: Verification & Safety Guardrails listing all test commands.
  - Zero-failure test run on `scripts/test_code_map_integrity.py`.

- [ ] **Step 1: Draft Section 5: Verification & Safety Guardrails in `CODE_MAP.md`**

Detail:
- Pre-commit checklist.
- The 4 core verification commands (`run_backend_tests.py`, `sync_android_web.py --check`, `phase1_preflight.py`, `test_code_map_integrity.py`).
- Screen reader accessibility invariant (RTL Arabic ARIA labels, zero visual regressions).

- [ ] **Step 2: Run complete integrity test suite**

Run: `python -m unittest scripts/test_code_map_integrity.py -v`  
Expected: 100% PASS on all assertions.

- [ ] **Step 3: Run repository preflight checks**

Run: `python scripts/phase1_preflight.py`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add CODE_MAP.md scripts/test_code_map_integrity.py
git commit -m "docs: finalize CODE_MAP.md with verification guardrails"
```

---

### Task 6: Final Review & Git Integration

**Files:**
- Audit: `git status`, `git diff`
- Verify: `docs/superpowers/plans/2026-10-27-codebase-architecture-map.md`, `CODE_MAP.md`

- [ ] **Step 1: Verify git status is clean and all files properly tracked**
- [ ] **Step 2: Verify all markdown links in `CODE_MAP.md` are valid relative links**
- [ ] **Step 3: Report completion and handoff to Ahmed**
