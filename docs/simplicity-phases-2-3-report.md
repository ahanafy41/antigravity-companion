# refactor: simplicity phases 2 and 3 — implementation receipt

2026-10-16. Status: published in c2204cab8a77d62412136d28ae894a6e14f283b7; remote branch verified. Maintainer reply: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6209104399. Baseline: c35d200. The user reviewed and approved the written design, then explicitly instructed full implementation, push and a maintainer comment. This expands the earlier maintainer freeze at the user's direction; no new maintainer sign-off on the expanded scope is claimed. No release, phone installation or main merge.

## Phase 2 completed

- Removed the ignored post-mutation MCP listing from CLI.mutate_mcp. The sole production caller ignores that return and builds its result from the owner MCP settings listing. Required help, cwd, lock, real mutation errors and no-replay remain. application.py required no change.
- Removed only the unmounted TextView status field/allocation/write and uncalled private acceptVoice from MainActivity. Fullscreen layout, lifecycle, public dictation, Intent delivery and accessible JavaScript announcements remain.
- Removed main-ui's duplicate Service Worker registration. The adapter retains its bundled-origin guard and error reporting. Runtime assets are retained; the existing build regenerates CACHE_NAME only in sw.js.

## Phase 3 completed

- The adapter owns accepted settings/policy documents with separate revisions, coalesced refresh and generation guards. Old GETs cannot overwrite accepted writes, including a GET started during a mixed policy/settings write. GET facade payload and revision headers are captured synchronously from the same accepted snapshot.
- The editor keeps its draft, dirty fields and original baseline revisions. A refresh cannot silently give a stale draft a newer revision; the server still rejects conflicts. Submitted patches are deep-copied, and save completion clears only confirmed keys whose draft values still match the submission. New edits made during a save remain.
- Settings writes serialize without replay. No mandatory post-PATCH GET can turn an accepted save into a failure. Partial policy success followed by settings failure exposes confirmed saved fields and independent revisions; no cross-resource atomicity is claimed, and successful policy fields are not blindly retried.
- BroadcastChannel is a single shared owner channel per page. Messages invalidate/refetch through the owner, not authoritative settings payloads. Reusing the sender channel prevents same-window bounce; incoming notifications do not emit new writes/notification loops. Direct model/effort/tones actions still use the adapter.
- Model/agent catalogs settle independently from settings, including malformed catalog responses. Offline/malformed settings refresh keeps the accepted snapshot and draft; stale failures do not replace newer status. Failed Reset announces failure and retains the draft. Broadcast rerender preserves focused control and selection. Existing 30-second refresh cadence and UI layout remain.

## Phase 4 retained

No changes to HMAC, CSRF, strict Origin/Host/main-frame checks, signature/identity/version checks, secret masking/blank-secret preservation, atomic-fsync persistence, journal epoch/action ownership/no-replay, distinct legacy/modern bridges, accepted fullscreen/start interface, LEGACY server compatibility or genuine loopback access. No dependency, production configuration, signing identity or application version changes.

Accessibility self-audit: no new controls or Tab-order change; existing names/labels retained, broadcast focus/selection tested, and status/error/reset outcomes have text and live announcements rather than color alone. This is local browser/source evidence, not new physical TalkBack/Jieshuo acceptance.

## Fresh verification

- Full Python discovery: 202 tests OK. Process suite: 12 OK; Black79 and flake8 passed for changed Python.
- JVM: 66 tests, zero failures/errors/skips. assembleDebug, testDebugUnitTest and lintDebug: BUILD SUCCESSFUL. Lint: 0 errors, 21 existing warnings.
- run_main_ui_tests.cjs: full production UI/adapter harness passed independently and at root. New cases cover stale two-tab baseline, forged invalidation payload, delayed and during-write GET, no mandatory reread, deep-copied array edits during save, partial policy success, catalog/offline/malformed failures, retained draft/focus and truthful Reset. Initial stale-draft regression failed with 200 instead of409 before the fix.
- Accepted UI run_ui_tests.cjs passed, including plugin mutation, cookie/CSRF/CSP/XSS, focus/Escape, offline history and actual SW/cache behavior. Legacy native facade, Node core/features, stream retry/no POST replay, settings panel and phone XML harness passed.
- APK web checks: 29 runtime assets match the canonical source, Android mirror and both packaged web trees. All 53 packaged server entries (51 server files plus the declared installer and requirements) and repair.html match their declared sources byte-for-byte. prepare_web_release.py --check passed.
- Diff verifiers passed for all six changed source/test files. Measured churn: CLI1.51%, MainActivity1.82%, main-ui3.58%, adapter23.28%; process tests23.96%, browser fixture63.60%. Production cap30%; existing behavioral browser fixture cap100% was declared separately. Byte-identical mirrors and cache-only derived changes were checked.
- Independent clean-code-guard and test-guard reviews found no remaining actionable defect in the scoped changes. Three intermediate findings (catalog parsing, false Reset announcement, GET during mixed save) were fixed and rechecked. JS syntax and git diff --check passed.

## Explicit non-passing checks and scope accounting

run_mentions_tests.cjs still fails at line42 on retired #prompt; it was not changed, and the maintainer's prior exemption remains recorded. The generic validate_code strict/human-grade tool still fails on adapter's unchanged Regex (original298, current362), and main-ui's unchanged delimiter scan at895 plus existing console.log notice at1520. Both pre-edit backups produce the same respective issues. Other changed files pass this validator. Node's actual JavaScript parser passes. No claim of full generic-validator success, 11 passing browser tests or a new blanket maintainer exemption is made; the extra existing main-ui notices are disclosed for review.

The post-edit scope audit found that the first pinpoint list omitted the existing error-serialization line510 needed to return partial savedFields/baseline. This was already required by the approved design; the manifest now records the omitted location transparently. No claim of zero deviation from the first line list is made. Original adapter LF endings and the adjacent blank separator outside the removed SW block were restored; the final explicit line intervals and file allowlist pass.

## Audit remainder and acceptance limits

Original audit items1,2,7,8,13,21,22 are addressed within the approved scope (item1's extra retired mentions runner is explicitly exempt). Items3,4,5,6,9,10,11,12,14,15,16,17,18,19,20 remain outside this implementation. No broad history/card/popup/stream/ledger/signature/asset-removal refactor is included.

Physical TalkBack/Jieshuo acceptance of the newest changes, live Termux phone helper, account/MCP/CLI/APK upgrade checks and upstream agy model-request resumption remain distinct and unverified here. SSE GET recovery is not a repair of agy's internal streamGenerateContent request.

## References and provenance

[Design](simplicity-phases-2-3-design.md), [plan](simplicity-phases-2-3-plan.md), root debug_manifest.json. Actual backup_manager receipts and current/baseline validator evidence are in ignored .tmp/SIMPLIFY-PHASES-2-3. [WHATWG BroadcastChannel](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts), [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit), [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) were verified live before implementing the existing-browser contracts.
