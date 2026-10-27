# feat: adopt maintainer main UI over API v1

2026-10-14 — implemented_locally; maintainer approval 6180568312 on 2026-10-15. The user instructed implementation. Implementation evidence and remaining field acceptance are recorded in ui-main-adaptation-report.md.

## Request and fixed source

The latest [owner comment](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6176545650) supersedes the earlier request to retain the PR UI. Adopt the existing main interface and start page as the sole active UI, preserving the modular backend and automatic local sessions.

- Current PR/worktree source: a818a88a2d4b705545e314d2a45fc0043753e252.
- Original repository main: 05470d668e3c846104dbed2f214c27f202d69b4e, read from upstream, not origin/main in this fork.
- index.html blob: 75cec2cc46813a0cf987dea891584713e8b76d53; 8567 lines, 356877 bytes.
- start.html blob: 7461a12d57f71d34c70ce3d106c47fb91dcc9599; 538 lines, 22575 bytes.
- Both upstream pages were inspected with git show only. At planning time neither had been imported; both are now adapted as recorded in the implementation report.

## Approved design

Keep main's visual layout, reading order, names, drawers, dialogs and floating listbox/option suggestions. This is adaptation of the supplied interface, not a new design. No Alpine, Tailwind, external framework, build pipeline or independent provider engine is introduced.

Recommended packaging adjustment: extract the supplied inline JavaScript/CSS into colocated local assets and convert inline event handlers/styles to listeners/classes as needed for the existing CSP. This preserves the appearance but changes the physical single-file packaging. Do not enable unsafe-inline scripts or weaken the native origin/main-frame boundary. The maintainer explicitly approved this adjustment in comment 6180568312.

Use one small explicit API-v1 adapter rather than a global fetch monkey-patch or new legacy REST compatibility surface. Preserve real session/run/request/cursor identities and errors; no fabricated authentication, delivered message, permission response or device success.

Serve the adapted conversation UI at / and the start UI at /start. The existing local Android repair.html remains the recovery entry when the HTTP server is unavailable: a server-hosted /start cannot repair absence of that same server.

## Verified contract corrections

| Owner mapping or upstream behavior | Actual contract / planned adaptation |
|---|---|
| POST /sessions/{id}/turns | No such route. POST /api/v1/sessions/{id}/runs with message and client_request_id returns 202 {run_id}; read named SSE from GET /api/v1/runs/{run_id}/events. |
| plugins as a bare JSON array | API returns {plugins:[...]}; models/agents/skills/commands use their own wrappers and MCP uses servers. |
| Stream POST prompt/continue/force_new/conversation_id | Explicitly create or resume a session, start one identified run, consume delta/tool/result, cancel by owned run_id, and restore snapshot on replay_unavailable. |
| synchronous AntigravityBridge | Asynchronous CompanionNative.postMessage({request_id,action,args}) and companion-native-result; preserve existing native.js transport and Android proof. |
| auth/start/input/accept_terms/open_browser | Use actual auth flow and native handoff; do not rebuild an unsupported credential-entry API. Account state remains unknown until independently verified. |
| permission_request replies and ai/send during active run | Preserve real policy API and approved FIFO next-turn queue. No claim of interactive approval or in-turn delivery without a verified CLI contract. |
| hardcoded localhost:7681 in start page | Same-origin URLs and the origin/port already proved by Android. No device-specific values. |
| shutdown/stopServer | Neither HTTP shutdown nor native stop_server exists. Add an explicit POST /api/v1/system/shutdown contract for the current server process only, with normal session/CSRF checks, a deliberate UI action and graceful cleanup; never general process killing. |
| direct GitHub release fetch | Use the existing native update workflow; retain same-origin connect-src and signed APK verification. Browser-only availability must be described truthfully. |
| icon.png | Referenced upstream, but absent at the pinned path; use the existing local icon.svg and consistent manifest. |

## All upstream legacy-route groups requiring audit

40 distinct paths occur in index.html. Each must be mapped to a real supported operation, an approved equivalent, or an explicitly unavailable capability before completion:

- AI: ai/commands, ai/send, ai/stream, ai/permission, ai/abort, ai/chat/reset, ai/conversation, ai/conversations, ai/models, ai/settings, ai/permissions/whitelist/remove, ai/quota, ai/tasks, ai/tasks/manage.
- Files: fs/list, fs/mkdir, fs/read.
- Account: auth/status, auth/open_browser, auth/start, auth/input, auth/accept_terms, auth/cancel, auth/logout.
- Customization: skills/list, skills/toggle, plugins/list, plugins/toggle.
- MCP: mcp/list, mcp/install, mcp/toggle, mcp/remove, mcp/auth/request_device, mcp/auth/test, mcp/auth/pair.
- System: system/version, system/update, system/usage, shutdown, client/visibility.

A truthful unavailable message is not recorded as completed feature parity. Expanding unsupported CLI features or creating an independent provider engine is outside this UI replacement unless separately approved.

## Files and responsibilities

| Planned file | Responsibility |
|---|---|
| server/web/index.html | main-derived conversation markup and accessible UI, replacing current PR shell |
| server/web/start.html | main-derived start markup, new HTTP route |
| server/web/main-ui.js and main-ui.css | supplied conversation behavior/style extracted for CSP compatibility |
| server/web/start-ui.js and start-ui.css | supplied start behavior/style with async native transport |
| server/web/main-v1-adapter.js | explicit v1 requests, session/run/SSE mapping and capability results |
| server/web/api.js, native.js, history.js | reuse current transport/local-history guarantees; change only if the new UI requires a bounded seam |
| server/application.py | /start and required asset routes; explicit owned shutdown; preserve existing v1 contracts/security |
| server/server.py | graceful owned shutdown integration if required by run_app lifecycle |
| server/web/sw.js and manifest.json | new active assets/start path, no API caching and same-origin icon |
| server/web/app.js, panels.js, ui.js, styles.css and vendor assets | retire as active PR UI after new flows pass; do not delete Android legacy fallback assets before its separate acceptance gate |
| Existing browser/backend scripts plus a focused adapter regression script | real contracts, DOM, CSP, race/cancel/recovery checks |
| SKILL.md, README.md, task.md, project_state.md, CHANGELOG.md and final UI report | actual behavior, provenance, verification and acceptance limits |

No Android native API expansion is assumed; preserve current message transport and Companion.ui.dismissTopDialog Back hook. If native source changes prove necessary, document the exact need before adding a new capability.

## Independently verifiable milestones

1. Import the pinned UI into the existing structure; retain visual/reading order, remove framework assets from the active entry points, make CSP-compatible local assets and /start route. Verify two pages render without console/CSP errors and remain keyboard accessible.
2. Wire automatic auth and catalogs using real wrapper/cwd schemas, then session creation, request deduplication, named SSE, cancellation, recovery and local history. Verify 401/403/409, interrupted streams and replay expiry without resending unknown work.
3. Adapt files, settings/policy, skills/plugins, MCP/OAuth, quotas, tasks and native handoffs against the 40-route checklist. Preserve explicit session selection, hidden secrets, revision and ownership. Unsupported operations stay accurately identified.
4. Adapt start/Back/voice/native update flows; add graceful own-server shutdown and its negative tests. Keep repair.html recovery and configured origins intact.
5. Run integration checks and independent clean-code-guard/test-guard/docs-guard review, refresh SW revision/cache membership, build Debug to verify packaged origins/assets, and record source parity. Physical TalkBack/Jieshuo/Termux/OTA acceptance remains separate.

Research, adapter implementation and independent QA may be split among agents with disjoint file ownership. No two agents write the imported index.html simultaneously.

## Required verification

- TDD regressions for each changed adapter contract before implementation.
- Real aiohttp + Chromium automatic session; no live model/account required for local fixtures.
- Same-origin/CSRF, secret masking, revision conflicts, malicious Markdown/HTML and absence of arbitrary native execution.
- Send/cancel/reconnect/duplicate-ID/queue/replay-expiry/conversation-resume flows.
- All catalogs, file/folder/spaces, stale cwd/results, listbox Arrow keys/Enter/Escape, Tab order, accessible names and non-color error communication.
- Both entry points, no inline-script/CSP errors, no forbidden direct remote calls, dynamic port and no false shutdown success.
- Existing relevant Python/Node scripts, Black79, flake8, JS syntax and git diff --check.
- Service worker upgrade from old cache, /start offline availability, API exclusion, generated assets and Debug build. No production version bump, signed release, install, commit, push or new GitHub reply in this planning step.

## Current state

Plan and compatibility audit complete; implementation not_started. Product source, UI and application behavior remain unchanged. Approval is required because this replaces the previously approved entire frontend and changes packaging plus the shutdown interface.

## Maintainer review submission

At the user's request, the full plan was [posted for maintainer approval](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6179106094) on 2026-10-15. Awaiting a response; no production implementation, commit or push has been performed for this UI replacement.
