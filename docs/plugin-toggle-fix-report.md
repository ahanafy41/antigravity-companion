# Approved plugin toggle fix — 2026-10-16

Status: published in f3f5c35de5e67f6564704c6c9883f306673fb832; the maintainer approved the fix and explicitly exempted both documented failed gates in https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6204451761. Final PR review and merge remain with the maintainer. Approval: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6202018307. Baseline: 5779cff62a0f4258850d27e765f4dd8288bc3cd2.

Upload completion notified: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6208540429. The two check failures remain recorded below as maintainer-approved exemptions; neither checker was modified.

## Scope and evidence

The approved expression is applied only at line 457 in `dispatch` in `server/web/main-v1-adapter.js` and its exact Android mirror: `encode(body.name)` becomes `encode(body.name || body.id)`. The comment's sample line 195, symbol `handlePluginToggle`, and snippet do not exist in this revision; the locked manifest records the actual location. This shared branch also serves skills/toggle. Name precedence, URL encoding, and enable/disable selection remain intact.

The existing browser test reproduced `/api/v1/plugins/undefined/disable` before the change and passes afterward. No tests were edited. No frozen production logic or runtime assets were removed. The existing release preparation updated only line 2 (CACHE_NAME) in both sw.js copies; it is derived cache metadata. All 29 runtime assets match both packaged APK trees.

Backup receipts: ignored `.tmp/FIX-PLUGINS-TOGGLE-ID/backup-receipts.json`; separate backup_manager lanes avoid same-basename collisions. Adapter backups precede the fix. The SW receipts already contain the refreshed cache value; scope verification compares SW against Git HEAD and confirms only CACHE_NAME differs. diff_verifier passes on both adapter backups at 0.37% churn. Node syntax checks pass on both files. Manifest JSON parsing passes.

## Fresh checks

- Python discovery: 201 tests, OK.
- JVM: 66 tests, zero failures/errors/skips.
- assembleDebug, testDebugUnitTest, lintDebug: BUILD SUCCESSFUL; lint has 0 errors and 21 warnings.
- Browser/JS entrypoints passed: run_ui_tests.cjs, run_main_ui_tests.cjs, run_legacy_native_tests.cjs, run_tests.cjs, run_features_tests.cjs, scripts/run_stream_retry_tests.js.
- Settings panel, phone harness, Android web APK asset checks, and prepare_web_release.py --check passed.
- run_mentions_tests.cjs fails at line 42 because getElementById('prompt') is null in the adopted UI. This pre-existing test is outside the approved two-line production fix.
- validate_code.py --strict --human-grade fails for both changed adapters AND both pre-edit backups: line 298, column 35, unclosed parenthesis. Its delimiter scan misreads a quote inside a JavaScript Regex. Node --check passes. The validator and the Regex were not changed.

The 100% exit gate is not met. No assertion of 11 passing browser tests, zero regression, current phone acceptance, release readiness, or upstream agy repair is made. The user authorized commit/push; the maintainer subsequently approved the fix, exempted both failures, and authorized push in comment 6204451761. Commit f3f5c35 is verified at the remote PR head. No remaining implementation was requested in that comment; final review and merge are the maintainer's next steps.
