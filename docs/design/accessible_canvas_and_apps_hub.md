# Accessible Live Canvas & Apps Hub

*   **Author:** ahanafy41
*   **Status:** Approved (Hardened via EGM Goldfish Review)
*   **Date:** 2026-11-21

## Overview

The Antigravity Companion app currently displays artificial intelligence (AI) generated code and markup as static text blocks in `<pre><code>` containers. When the AI agent writes mini-apps, interactive widgets, calculators, or HyperText Markup Language (HTML) dashboards, users cannot test or run them dynamically within the session. While modern AI environments (such as ChatGPT Canvas or Claude Artifacts) offer live execution, they rely on complex `<iframe>` hierarchies that trap focus, freeze screen readers (TalkBack and Jieshuo), or break on resource-constrained mobile browsers.

This feature introduces an on-page, accessible **Live Canvas** runner and a persistent **"التطبيقات" (Apps)** hub. Users can execute agent-generated apps directly in a safe, non-iframe scoped Document Object Model (DOM) container, test them using standard screen-reader swipe gestures, manually save approved apps into a persistent drawer-accessible hub, and seamlessly hand them back to the chat agent for iterative refinement via a dedicated "Edit in Chat" action.

## The Problem

1. **Static Display Only**: When the agent creates functional HTML and JavaScript (JS) tools (such as an audio player, a percentage calculator, a countdown timer, or a task tracker), the companion app only renders syntax-highlighted code. The user must manually export and run the file elsewhere.
2. **Screen Reader Freezes with Standard Iframes**: Desktop-oriented iframe approaches trap virtual cursors and cause severe accessibility degradations on Android when TalkBack or Jieshuo inspects cross-origin frame hierarchies.
3. **No Persistent Mini-App Lifecycle**: Once an artifact is generated in chat, there is no centralized library to organize, launch, or re-open saved interactive tools across future sessions.
4. **Friction in Iterative Prompting**: Users lack a one-touch bridge from a running interactive preview back into the chat context to instruct the agent on specific modifications.

## Goals

*   **G1 - Accessible Live Canvas Runner**: Mount and execute HTML/CSS/JS mini-apps on-page within a dedicated modal container without heavy iframes, preserving full TalkBack/Jieshuo linear navigation.
*   **G2 - Persistent Apps Hub ("التطبيقات")**: Provide a dedicated drawer entry named "التطبيقات" with a dynamic badge counter, opening a dialog that catalogs all saved tools with one-touch launch, edit, and deletion actions.
*   **G3 - Explicit Save Workflow**: Include a `[💾 حفظ في التطبيقات]` action in the canvas toolbar so users selectively persist apps they approve.
*   **G4 - Agentic Chat Iteration Bridge**: Include a `[🛠️ تعديل التطبيق في الشات]` action that closes/minimizes the canvas, restores keyboard focus to the chat message input, and prefixes the app context for immediate refinement.
*   **G5 - Audio & ARIA Announcements**: Expose a minimal client-side bridge (`window.CompanionApp.announce(text)`) connected to an Accessible Rich Internet Applications (ARIA) live region (`aria-live="polite"`) to speak live interactive changes to screen readers.
*   **G6 - Local File-Backed Persistence**: Provide Create, Read, Update, Delete (CRUD) Representational State Transfer (REST) Application Programming Interface (API) endpoints (`/api/apps`) in the Termux server backed by an optimized metadata index and atomic JSON files in `${DATA_DIR}/apps/`.

## Non-Goals

*   **NG1 - Heavy Desktop Windowing**: Multiple floating resizable desktop windows or multi-pane docking systems are out of scope. The interface remains mobile-first and modal-based.
*   **NG2 - Cloud App Synchronization**: Syncing apps to third-party cloud servers or remote accounts is out of scope; all data remains strictly local to Termux.
*   **NG3 - Untrusted Multi-Tenant Sandbox**: The application runs in a single-user local environment; operating system level virtualization (such as Docker or WebAssembly isolation) is not required for local mini-tools. The trust model assumes locally generated code within a single-user boundary.

## Open Questions

None. All architectural decisions have been resolved.

### Resolved Architectural Decisions
*   **Drawer Label**: Confirmed as "التطبيقات".
*   **Persistence Model**: Explicit manual save workflow selected over automatic background persistence.
*   **Trust Model**: Local single-user runner with defensive DOM scoping and timer/listener lifecycle cleanup.

## Goal Traceability Matrix

| Goal ID | Goal Description | Mapped CUJ | Implementation Files | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **G1** | Accessible Live Canvas Runner | CUJ 1 | `canvas-runner.js`, `index.html`, `main-ui.css` | `run_canvas_runner_tests.cjs` |
| **G2** | Persistent Apps Hub ("التطبيقات") | CUJ 4 | `apps-manager.js`, `native-drawer.js`, `index.html` | `run_canvas_integration_tests.cjs` |
| **G3** | Explicit Save Workflow | CUJ 2 | `canvas-runner.js`, `apps-manager.js`, `apps_service.py` | `run_apps_api_tests.cjs` |
| **G4** | Agentic Chat Iteration Bridge | CUJ 3 | `canvas-runner.js`, `apps-manager.js`, `chat-studio.js` | `run_canvas_integration_tests.cjs` |
| **G5** | Audio & ARIA Announcements | CUJ 1, 2 | `canvas-runner.js`, `audio-announcer.js` | `run_canvas_runner_tests.cjs` |
| **G6** | Local File-Backed Persistence | CUJ 2, 4 | `apps_service.py`, `application.py` | `run_apps_api_tests.cjs` |

## Critical User Journeys (CUJs)

### CUJ 1: Prompt to Live Canvas Execution
*   **Given**: User is in an active chat session in the companion app with TalkBack enabled.
*   **When**: User prompts the agent: *"اعمل لي تطبيق حاسبة زكاة المال الصوتية"*, and the agent responds with an interactive HTML/JS artifact.
*   **Then**: The chat renders an artifact card with a `[⚡ تشغيل في الكانفاس]` button. Clicking the button opens the `canvas-runner-dialog`. The DOM mounts cleanly, and TalkBack announces the app title and focuses the canvas controls without page refresh or frame entrapment.

### CUJ 2: Testing and Explicit Saving
*   **Given**: An interactive mini-app is actively running in the canvas runner dialog.
*   **When**: The user tests the buttons, verifies calculations, and clicks `[💾 حفظ في التطبيقات]`.
*   **Then**: The client sends a `POST /api/apps` request. The app is stored in `${DATA_DIR}/apps/<id>.json` and indexed in `${DATA_DIR}/apps/index.json`. The toolbar button state changes to `[✅ تم الحفظ]`, an auditory chime sounds, and the drawer counter badge increments by 1.

### CUJ 3: Seamless Chat Iteration ("تعديل التطبيق بالذكاء الاصطناعي")
*   **Given**: An app is open in the canvas, and the user identifies an adjustment needed (e.g., adding an audio alert on calculation).
*   **When**: The user clicks `[🛠️ تعديل التطبيق في الشات]`.
*   **Then**: The canvas dialog closes cleanly. Focus is programmatically restored to `#message-input` in the chat, pre-populated with `@تعديل_تطبيق: [اسم التطبيق] (ID: [app_id])` with the current code context preserved. The user dictates the requested modification and presses send.

### CUJ 4: Launching Saved Apps from the Drawer Hub
*   **Given**: The user starts a new session or navigates to the main interface.
*   **When**: The user opens the side drawer and activates `التطبيقات`.
*   **Then**: The `apps-dialog` opens, displaying an accessible list of saved tools. Each entry provides clear swipe-accessible buttons with minimum 48x48dp touch targets: `[تشغيل ⚡]`, `[تعديل 🛠️]`, and `[حذف 🗑️]`. Activating `[تشغيل]` launches the tool directly in the Live Canvas.

## Technical Plan (Architecture)

### Architectural Overview

The Accessible Live Canvas & Apps Hub architecture consists of three decoupled layers:
1. **Presentation & Accessible Sandbox Layer (Client)**: Manages dialog visibility, non-iframe DOM scoping, keyboard focus restoration, and TalkBack live region synthesis.
2. **State & Orchestration Layer (Client)**: Bridges the chat interface, the artifacts viewer, and the drawer hub to the canvas lifecycle.
3. **Storage & REST Persistence Layer (Server)**: A local file-backed storage service exposing CRUD endpoints with Cross-Site Request Forgery (CSRF) verification in Termux.

```mermaid
flowchart TD
    User["المستخدم (TalkBack / Jieshuo)"] -->|يكتب طلب تطبيق| Chat["نافذة المحادثة (Chat Studio)"]
    Chat -->|توليد الكود| Art["عارض الأرتيفاكتس (Artifacts Viewer)"]
    Art -->|زر تشغيل في الكانفاس| Canvas["محرك الكانفاس (Canvas Runner)"]
    Canvas -->|تفاعل بالسحب والنقر| Mount["حاوية العرض المعزولة (DOM Mount Point)"]
    Mount -->|أحداث ونطق صوتي| Announcer["الناطق الصوتي (aria-live region)"]
    Canvas -->|زر تعديل في الشات| Chat
    Canvas -->|زر حفظ في التطبيقات| AppsMgr["مدير التطبيقات (Apps Manager)"]
    Drawer["القائمة الجانبية (Drawer: التطبيقات)"] -->|استعراض المحفوظات| AppsMgr
    AppsMgr -->|REST API Calls| Backend["الخادم المحلي (aiohttp / Termux)"]
    Backend -->|قراءة فهرس O(1)| Index["فهرس التطبيقات (apps/index.json)"]
    Backend -->|كتابة ذرية| Storage["مستودع الملفات (${DATA_DIR}/apps/<id>.json)"]
```

### Component Architecture & System Boundaries

#### 1. Configuration Constants & Environment
*   `${DATA_DIR}` represents the root data storage directory for Antigravity Companion, resolving to `/data/data/com.termux/files/home/.antigravity-server` (or the directory passed via `--data-dir`).
*   `${DATA_DIR}/apps/` is the dedicated persistent directory for saved applications.

#### 2. Accessible Sandbox Engine (`canvas-runner.js`)
*   **Mount Mechanism**: Uses an isolated container element (`<div id="canvas-mount-point" role="region" aria-label="منطقة تشغيل التطبيق">`).
*   **Style Scoping (`transformAppStyles`)**: Embedded `<style>` tags are parsed. Selectors matching `html`, `body`, and `:root` are replaced with `#canvas-mount-point`. Other selectors (except `@keyframes`) are prefixed with `#canvas-mount-point ` to prevent style leakage. Container properties (`contain: layout style;`) are applied.
*   **Script Lifecycle & Sandboxing**:
    *   Scripts are parsed from the HTML payload using `DOMParser`.
    *   `window.CompanionApp` SDK is injected prior to script evaluation, providing:
        *   `CompanionApp.announce(text, isAssertive)`: Pushes text to a debounced announcer (throttled at 250ms). Toggles a zero-width space (`\u200B`) for identical sequential strings.
        *   `CompanionApp.onDestroy(callback)`: Registers teardown hooks for cleaning up app-allocated resources (e.g., `AudioContext`).
    *   Active timer tracking: `CanvasRunner` tracks `setTimeout` and `setInterval` handles initiated during canvas run.
    *   `AbortController`: An active `AbortController` instance is tied to the canvas lifecycle. All window event listeners registered via `CompanionApp.addEventListener` are automatically purged on unmount.
*   **Focus Lifecycle & Defensive Recovery**:
    *   On Open: Captures `document.activeElement` as `previousFocusedElement`, opens `<dialog id="canvas-runner-dialog">`, and directs focus to the canvas title.
    *   On Close / Edit: Safely detaches the mounted app DOM, clears in-flight timers and listeners, and executes defensive focus restoration:
        ```javascript
        if (previousFocusedElement && document.contains(previousFocusedElement)) {
          previousFocusedElement.focus();
        } else {
          const fallback = document.getElementById('message-input') || document.body;
          fallback.focus();
        }
        ```

#### 3. Apps Hub Manager (`apps-manager.js`)
*   Manages the state and UI of `<dialog id="apps-dialog">`.
*   Fetches lightweight metadata via `GET /api/apps` (powered by `index.json`).
*   Maintains the drawer badge (`#val-apps-count-drawer`).
*   Renders accessible list items (`<article role="listitem">`) with minimum 48x48dp touch targets and descriptive labels (e.g., `aria-label="تشغيل حاسبة الزكاة"`).
*   Implements accessible client-side pagination (10 apps per page) when total apps exceed 15.

#### 4. Backend Persistence Service (`server/apps_service.py` & `server/application.py`)
*   **Index Architecture**: Maintains `${DATA_DIR}/apps/index.json` containing `{ "apps": [ { "id": "...", "title": "...", "description": "...", "created_at": "...", "updated_at": "..." } ] }`. This ensures $O(1)$ disk I/O when listing apps.
*   **Atomic Persistence Pattern**: File writes utilize temporary files with directory sync and atomic replacement:
    ```python
    temp_file = tempfile.NamedTemporaryFile('w', dir=apps_dir, delete=False, encoding='utf-8')
    json.dump(payload, temp_file, ensure_ascii=False, indent=2)
    temp_file.flush()
    os.fsync(temp_file.fileno())
    temp_file.close()
    os.replace(temp_file.name, target_file)
    ```
*   **Security & Path Traversal Guards**:
    *   `app_id` must match `^[a-zA-Z0-9_-]{1,64}$`.
    *   Canonical path verification: `os.path.commonpath([apps_dir, target_file]) == apps_dir`.
    *   Payload limits: Max 500 KB per app code, max 100 characters for title, max 200 total stored apps.
*   **REST API Schema**:
    *   `GET /api/apps`: Returns `{"apps": [...]}` with status 200.
    *   `GET /api/apps/{app_id}`: Returns complete app object including executable code.
    *   `POST /api/apps`: Accepts `{"id"?: "...", "title": "...", "description": "...", "code": "..."}`. Returns 201 on creation, 200 on update. Protected by CSRF token header (`x-csrf-token`).
    *   `DELETE /api/apps/{app_id}`: Deletes `<app_id>.json` and updates `index.json`. Returns `{"status": "deleted"}`. Protected by CSRF.
    *   Standard Error Schema: `{"error": "<human readable Arabic message>", "code": "<ERROR_CODE>"}` with appropriate HTTP status codes (400, 403, 404, 500).

## Alternatives Considered

### Alternative A: Standard Iframe Sandbox Hierarchy
*   **Description**: Executing the generated HTML/JS inside an isolated `<iframe>` element using `sandbox="allow-scripts"` and communicating via `postMessage`.
*   **Pros**: Native browser security barrier and complete CSS namespace isolation.
*   **Cons**: On Android mobile devices, TalkBack and Jieshuo screen readers frequently freeze, trap focus, or fail to swipe linearly past iframe boundaries.
*   **Reason for Rejection**: Nested iframes cause severe focus trapping, responsiveness lags, and navigation freezes under TalkBack and Jieshuo on Android.

### Alternative B: Automatic Background Saving for All Generated Artifacts
*   **Description**: Automatically saving every HTML artifact created by the agent directly into the "التطبيقات" repository without asking the user.
*   **Pros**: No user interaction required to persist applications.
*   **Cons**: Pollutes the "التطبيقات" list with intermediate code snippets, broken experiments, and throwaway test scripts, increasing disk clutter and degrading list navigation.
*   **Reason for Rejection**: Manual curation via an explicit `[💾 حفظ في التطبيقات]` action ensures only verified, high-quality tools are retained.

### Alternative C: External Browser Tab Execution
*   **Description**: Serving generated mini-apps as standalone web pages served on a local port (e.g., `http://127.0.0.1:7681/apps/<id>`) opened in a separate Chrome tab.
*   **Pros**: Full screen real estate and native browser handling.
*   **Cons**: Forces app-switching between Chrome and the Companion app, breaking the rapid iteration loop and losing the one-click "Edit in Chat" feedback bridge.
*   **Reason for Rejection**: Defeats the core objective of an integrated on-page Canvas experience with seamless round-trip chat iteration.

### Alternative D: Native Shadow DOM Isolation
*   **Description**: Attaching a Shadow Root (`Element.attachShadow({ mode: 'open' })`) to the mount point for encapsulated styling.
*   **Pros**: Complete native style encapsulation without regex parsing.
*   **Cons**: Some older Android WebViews present inconsistent accessibility tree exposure for Shadow DOM nodes under TalkBack; standard form controls inside shadow roots sometimes require custom accessibility wiring.
*   **Decision**: Adopted as an optional progressive enhancement; default implementation relies on explicit CSS prefixing (`transformAppStyles`) combined with container containment properties (`contain: layout style;`).

## Risks & Mitigations

| Risk & Failure Mode | Severity | Impact | Concrete Mitigation Architecture |
| :--- | :--- | :--- | :--- |
| **Runaway Scripts / Infinite Loops** | High | Thread freeze affecting TalkBack | Wrap script evaluation in `try/catch`. Enforce user awareness that execution runs locally. Provide an emergency abort listener on the host dialog close button. |
| **Background Timer & Audio Leakage** | High | Battery drain and phantom audio | `CanvasRunner` monkey-patches `setTimeout`/`setInterval` to track active IDs and purges them on close. `CompanionApp.onDestroy` terminates active `AudioContext` instances. |
| **Focus Stranding on Chat Re-renders** | High | TalkBack drops focus to viewport top | Implement defensive focus fallback: check `document.contains(previousFocusedElement)`, fallback to `#message-input` or `document.body`. |
| **Storage Thrashing & Disk Latency** | Medium | Slow drawer expansion on Termux | Implement centralized `apps/index.json` metadata cache. `GET /api/apps` performs $O(1)$ read without touching individual app files. |
| **File Corruption on Process Termination** | Medium | Crashed JSON deserialization | Implement atomic file replacement via temporary files (`tempfile.NamedTemporaryFile` + `os.replace` + `os.fsync`). |
| **CSS Leakage / Host UI Defacement** | Medium | Host layout breakage or hidden buttons | `transformAppStyles` replaces `html`, `body`, `:root` with container selector and prefixes rules. Apply `contain: layout style;` to mount point. |
| **ARIA Live Region Flooding** | Low | Stalled speech queue in TalkBack | Throttle live announcements to 250ms minimum. Toggle zero-width spaces for duplicate string notifications. |

## Non-Functional Requirements

### Security & Data Integrity
*   **Path Traversal Prevention**: App IDs are strictly validated against `^[a-zA-Z0-9_-]{1,64}$`. Canonical path verification guarantees target files reside within `${DATA_DIR}/apps/`.
*   **CSRF Enforcement**: All state-modifying requests (`POST /api/apps`, `DELETE /api/apps/{id}`) require a valid session cookie and `x-csrf-token` header matching the active session secret.
*   **Payload Quotas**: Max 500 KB per app code, max 100 characters for title, max 200 total stored apps.

### Accessibility & Screen Reader Benchmarks (TalkBack & Jieshuo)
*   **No Frame Boundaries**: Eliminates `<iframe>` elements to ensure the virtual cursor traverses seamlessly from the toolbar into the interactive app content and back.
*   **Semantic ARIA Roles**: Dialogs declare `role="dialog"`, `aria-modal="true"`, and explicit `aria-labelledby` headers.
*   **Live Announcements**: App interactions trigger `CompanionApp.announce(text)`, updating an off-screen container with `aria-live="polite"` so screen readers speak changes instantly without user repositioning.
*   **Deterministic Focus Restoration**: When closing the canvas or moving to edit mode, focus is programmatically returned to the originating element (`document.activeElement` or `#message-input`) to avoid keyboard focus loss.
*   **Touch Target Minimums**: All interactive buttons meet WCAG 2.5.5 minimum 48x48dp touch targets.

### Performance & Memory Safety
*   **Payload Separation**: `GET /api/apps` returns lightweight metadata from `index.json`. Full code is fetched on-demand when launching an individual app.
*   **Clean DOM Teardown**: Upon closing the canvas, all mounted event listeners and dynamic child elements are detached to prevent memory leaks in long-running sessions.

## Detailed Implementation Plan

### Implementation Phases & Work Breakdown

#### Phase 1: Storage Layer & Backend REST Service
*   **Deliverable**: `server/apps_service.py`, `server/application.py`, and automated API tests.
*   **Tasks**:
    1. Implement `apps_service.py` with `list_apps(data_dir)`, `get_app(data_dir, app_id)`, `save_app(data_dir, app_dict)`, and `delete_app(data_dir, app_id)`.
    2. Implement atomic file write helper and `${DATA_DIR}/apps/index.json` synchronization.
    3. Implement path traversal validation (`^[a-zA-Z0-9_-]{1,64}$` and `commonpath`).
    4. Register routes in `application.py`: `GET /api/apps`, `GET /api/apps/{app_id}`, `POST /api/apps`, `DELETE /api/apps/{app_id}` with CSRF protection.
    5. Write and execute `server/web/run_apps_api_tests.cjs` verifying CRUD, path traversal rejection, and error responses.

#### Phase 2: Accessible Canvas Runner Engine
*   **Deliverable**: `server/web/canvas-runner.js` and automated unit tests.
*   **Tasks**:
    1. Implement `CanvasRunner` UMD module with `launch(appData)`, `teardown()`, `reset()`.
    2. Implement `transformAppStyles(cssText, scopeSelector)` for safe CSS encapsulation.
    3. Implement `DOMParser` extraction and script evaluation with `window.CompanionApp`.
    4. Implement active timer tracking and `AbortController` listener purging.
    5. Implement defensive focus restoration with fallback to `#message-input`.
    6. Implement throttled ARIA live announcer (`aria-live="polite"` with duplicate string toggle).
    7. Write and execute `server/web/run_canvas_runner_tests.cjs`.

#### Phase 3: Apps Hub UI & Navigation Drawer Integration
*   **Deliverable**: `server/web/apps-manager.js`, `server/web/index.html`, and `server/web/native-drawer.js`.
*   **Tasks**:
    1. Add `btn-open-apps` to `.drawer-body` in `index.html` with counter `#val-apps-count-drawer`.
    2. Add `<dialog id="apps-dialog">` and `<dialog id="canvas-runner-dialog">` in `index.html`.
    3. Add high-contrast styling in `main-ui.css` supporting 48x48dp touch targets.
    4. Implement `AppsManager` UMD module for fetching apps, rendering cards, handling delete confirmations, and updating the badge count.
    5. Wire drawer opening event in `native-drawer.js`.

#### Phase 4: Chat & Artifact Integration
*   **Deliverable**: `server/web/artifacts-viewer.js` and round-trip chat bridge.
*   **Tasks**:
    1. Update `artifacts-viewer.js` to inject `[⚡ تشغيل في الكانفاس]` on HTML/runnable cards.
    2. Implement "Edit in Chat" toolbar action: pre-fills `#message-input` with `@تعديل_تطبيق: [اسم التطبيق] (ID: [app_id])` and sets focus.
    3. Implement `[💾 حفظ في التطبيقات]` action connecting Canvas to `AppsManager.saveCurrentApp()`.

#### Phase 5: Automated System Integration & Deployment
*   **Deliverable**: `server/web/run_canvas_integration_tests.cjs` and production sync.
*   **Tasks**:
    1. Write and run full lifecycle integration test: create -> canvas mount -> save -> drawer retrieve -> edit in chat.
    2. Execute existing regression suite (`run_tests.cjs`).
    3. Sync updated repository files into active server directory (`~/.antigravity-server/`).
    4. Perform live verification by generating an accessible sample mini-app.

### Target Files to Create and Modify

1. **`server/apps_service.py`** (Create) - Backend JSON storage service and atomic index manager.
2. **`server/application.py`** (Modify) - REST API route handlers with CSRF checks.
3. **`server/web/canvas-runner.js`** (Create) - Client-side Canvas runtime and accessibility engine.
4. **`server/web/apps-manager.js`** (Create) - Apps Hub controller and drawer badge sync.
5. **`server/web/index.html`** (Modify) - Drawer button, Apps modal, and Canvas runner dialog.
6. **`server/web/main-ui.css`** (Modify) - High-contrast styling and touch target dimensions.
7. **`server/web/native-drawer.js`** (Modify) - Drawer button click listener and badge refresh.
8. **`server/web/artifacts-viewer.js`** (Modify) - Artifact card execution button injection.
9. **`server/web/run_apps_api_tests.cjs`** (Create) - Node.js API integration tests.
10. **`server/web/run_canvas_runner_tests.cjs`** (Create) - Node.js CanvasRunner unit tests.
11. **`server/web/run_canvas_integration_tests.cjs`** (Create) - End-to-end integration tests.
12. **`docs/design/accessible_canvas_and_apps_hub.md`** (Create) - Official design document.
