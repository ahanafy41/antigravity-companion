# refactor: final lean cleanup report

2026-10-16. Implementation, local integration, independent reviews and publication complete; awaiting maintainer review.

## Authority and exact scope

Maintainer [final decision6220674524](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6220674524) supersedes the verbatim-import instruction. User explicitly authorizes all requested work. Baseline684f179329478047cec8af80e300b49ae48f7ad7. [Plan](final-lean-cleanup-plan.md), debug_manifest.json and19 pre-mutation snapshots locked scope before production edits; recoverable originals stay under ignored .tmp/FINAL-LEAN-CLEANUP.

Delivered production diff is deletion only: isPortOpen and its three orphan imports, four strings, three colors, canonical/mirrored app.js/panels.js, and exactly two static allowlist entries in application.py. No handler, API or router implementation changed. app_name and HTML attribution remain. The phrase seven strings in the comment is interpreted against the approved report's explicitly identified seven resources: status_connected/status_connecting/action_doctor/developed_by and surface/text_primary/text_secondary.

Only the two named web assets are retired. state.js/ui.js/styles.css remain in both trees and APK under the narrowed final instruction. Native speech UI and companion-voice-input listener were already absent. speech_enabled stays solely in the adapter rejection list; the active-adapter checker verifies409 and no writes/native speech calls for an obsolete setting submission.

No upstream import. Eight protected source hashes match the baseline, including server/server.py, launcher.py, active main-ui.js, main-v1-adapter.js, old bundled server snapshot, mirrored active mainUI, app/build.gradle and server/version.json. Version/signing/dependency values remain untouched. Transcript expansion and artifacts are fully deferred. SW cache revision and Android mirror change only through the existing build.

## Dependent checker migration and coverage correction

Both original dependent checkers passed before retirement. After the actual canonical asset move, run_features_tests.cjs failed with ENOENT panels.js at48 and run_settings_panel_tests.py with FileNotFoundError panels.js at69 (both exit1). The migrated checkers pass against actual active source; no fabricated Companion.panels implementation or wrapper repeats the full mainUI suite.

| Checker | Current exercised contract |
|---|---|
| run_features_tests.cjs | Real main-v1-adapter in NodeVM; nativeauth handoff, policy revision and deny/ask preservation, owned/local task cancellation, queued UUID retry and refusal of a different pending message, MCP cwd/revision and OAuth, session single-flight/reuse, retained feedback dedup, obsolete speech-setting rejection |
| run_settings_panel_tests.py | Real index.html/assets/api/adapter/mainUI served through Playwright network fixtures; actual labels and Tab, partial sound-only write with quoted If-Match revision, preservation of unknown custom settings, whitelist removal with policy revision and deny/ask preservation, workspace file mentions with safe JSON quoting including embedded quote |
| run_main_ui_tests.cjs | Existing ownership/race/partial-save/CSP/browser regressions retained; OAuth secret field explicitly checked as password; logout confirmation listener coverage strengthened during independent review |

Mocks sit at HTTP/storage/native boundaries. The full server202 test suite is retained. No product DOM or network state is invented merely to preserve an obsolete UI test.

Correction to the earlier lean report: the old features voice-cancellation test actually requested native start_voice/cancel_voice through panels.js. Its historical PASS was legacy-test evidence, not proof of browser voice cancellation. That inaccurate description is corrected explicitly in docs/lean-companion-report.md. The nativevoice test is retired because the feature was already removed. Browser speechSynthesis/WebAudio/haptics production remains untouched.

Old one-off UTC scheduling UI tests belonged to panels.js, not the active adapter. Server scheduler coverage remains in run_schedule_tests.py (UTC, recovery, queue/dispatch) and run_feature_tests.py. Old arbitrary rule-editor/app.sessionOptions/desktop logout text assertions are replaced only by actual supported UI/API behavior; no equivalent old controls are invented. A file name containing a quote is now checked for safe JSON escaping, rather than asserting the retired panel's rejection policy.

Independent review found two migration gaps: the adapter-only logout test omitted the old confirmation-cancellation/no-write protection, and the Python HTTP fixture tolerated unexpected mutation methods without auditing all writes. They are test coverage findings; no production source was changed to repair them. Both gaps are repaired and independently verified: normal source passes; removing the real confirmation block in memory makes mainUI fail at163, and injecting POST /tasks in memory makes the Python mutation ledger reject it. Lifecycle POST /client/visibility is explicitly validated (exact keys, UUIDv4, visible boolean and CSRF); all other writes are exactly one settings PATCH and one policy PATCH. Reviewer source hashes match the frozen files.

## Verified local results

| Check | Observed result |
|---|---|
| Python discovery scripts/run_*tests.py | 202 tests, OK,34.516s |
| Clean Gradle assembleDebug/testDebugUnitTest/lintDebug | BUILD SUCCESSFUL;46 tasks executed |
| Gradle JVM XML | 35 tests across11 suites;0 failures/errors/skips |
| Lint | 0 errors/fatal;6 warnings: RequiresFeature4, RedundantLabel1, DataExtractionRules1 |
| Accepted UI / legacy native facade / Node core | Pass |
| Stream retry/dedup/abort/no POST replay / phone XML harness | Pass |
| Migrated Features / Settings / full mainUI | Pass after both review repairs; independently repeated |
| Changed CJS syntax / Python Black79 and flake8 | Pass after final review repairs |
| Android asset harness | 2 tests, OK;27 runtime web files byte-identical in mirror and both APK web trees |
| APK server tree / repair | 51 entries (49 server-source entries plus installer/requirements) and repair byte-identical to source |
| Removed assets in APK | app.js/panels.js absent in both web trees; state/ui/styles retained and byte-identical |
| Actual HTTP using existing FeatureTests fixture | /app.js and /panels.js404; /,/start,/main-ui.js,/state.js,/ui.js,/styles.css,/api/v1/auth/session200 |
| Scope / protected sources | Exact4file retirement set and file allowlist;8 protected hashes matched |

The same-configuration Debug APK shrank from4,256,680 to4,207,180bytes:49,500bytes less (about1.16%). Prior full pre-lean baseline4,454,748bytes gives247,568bytes cumulative reduction (about5.56%). No startup-latency/100ms or real-phone claim follows from size measurements.

## Mechanical checker limits and acceptance

Generic strict/human-grade validation reports no production-source finding among the changed files. Its existing Python CLI print notice remains one before and one after (original line200; final 243); CLI stdout is intentional. Node syntax and real-browser checks are authoritative for CJS; the generic tool is not a full JavaScript AST/schema proof.

The default30% churn cap flags deletion of four of seven string lines (57.14%) and three of nine color lines (33.33%), plus the necessary retired-checker migrations (final Python186.79%, Node176.54%). These are disclosed intentional changes within the exact approved allowlist, not a claimed universally passed churn budget. The mainUI checker delta is 3.39%; production mainUI is unchanged.

The previously exempt mentions runner and inherited lexical warnings on unchanged mainUI/adapter are not reclassified as passing. No new blanket exemption is inferred. Production source hashes preserve the existing settings/auth/SSE/no-replay guards; local passing tests do not prove every possible runtime path.

The active adapter reports agy account state as unknown; its logout button is hidden in that state. Direct invocation of its real listener to check confirmation is regression coverage, not proof of an accessible visible logout flow. This is preexisting and unchanged, outside the cleanup scope. TalkBack/Jieshuo, real-phone start/stop and live agy/Termux/account behavior remain field acceptance.

No release, physical installation/control or upstream merge. Implementation commit [4e3371d](https://github.com/kamalyaser31/antigravity-companion/commit/4e3371df3c0144660c3ca80d5910e1c440ff82f6) was pushed to codex/refactor-phase-1; git ls-remote and PR headRefOid both matched its full hash before the [detailed maintainer reply](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6221390646). PR description now reflects the final scope and results. This delivery receipt changes documentation only. No implementation or review finding remains open within the authorized cleanup; field acceptance and deferred features remain as stated.

## Official verification references

Existing routing behavior: [aiohttp routes](https://docs.aiohttp.org/en/stable/web_quickstart.html#resources-and-routes). Existing checker boundaries: [Playwright Python request handling](https://playwright.dev/python/docs/network#handle-requests), [Node VM source execution](https://nodejs.org/api/vm.html#vmrunincontextcode-contextifiedobject-options). These confirm used interfaces; no runtime dependency is upgraded.
