# refactor: lean companion implementation report

2026-10-16. Implementation, local verification and publication complete; awaiting maintainer review.

## Authority and scope

Executed maintainer [comment6212526418](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6212526418) after reading its referenced [RFC](lean-companion-architecture-rfc.md) and [spec](lean-companion-spec.json) in full. These are unchanged snapshots of preview/refactor-test@7baaad8094f439ac69efbae5722aec11023f52f7. Baseline cf4c7a86ed1cb7eb8ed84d4e02a71a35f6ac6df5; current user explicitly authorizes full implementation, push and detailed reply on PR1. The new specification supersedes earlier native voice/8765 preservation instructions.

The plan, root debug_manifest.json, SHA256 baseline receipts and recoverable snapshots were locked before production edits. Ignored .tmp/LEAN-COMPANION contains original files and recoverably moved retirements; none belongs in Git. Three implementers had disjoint native/web/tool ownership; independent native, web and tool reviews followed.

## Delivered behavior

- Retired all28 files named by the owner (17 Java, one service XML, ten tests), plus five proven orphans: LegacyVoiceApi.java, LegacyVoiceActions.java, ActionLedger.java, ActionLedgerTest.java and ic_mic.xml. The ledger and legacy voice consumers were retired; the mic drawable had no consumer. The exact33-file deletion set is in debug_manifest.json. Native source and APK DEX no longer contain the20 retired production classes.
- Removed AccessibilityService and VoiceCommandActivity manifest entries, RECORD_AUDIO, speech/TTS package queries, automation/voice strings, transparent voice theme, accessibility banner and service/voice lifecycle hooks. Removed the sole-use Java-WebSocket dependency. Retained network, notifications, boot, installation and Termux behavior. VIBRATE remains because the browser still uses navigator.vibrate.
- MainActivity remains a fullscreen WebView shell. connectionStatus exposes exactly server_available, version and can_install. HMAC state stays private. Doctor exposes exactly termux_installed, termux_run_command_permission and server_connectivity; its network probe runs on the existing worker.
- Moved strict required-string validation from retired ScreenSnapshot to retained NativeActionArguments without weakening type checks. Updated remaining MainActivity/AppUpdateManager consumers. New Termux configuration no longer generates android_port; existing user configuration values are preserved.
- Preserved modern server stop by moving its necessary HTTP operation into ServerConnection: verify HMAC before private Bearer bootstrap, accept session Cookie rotation, send Cookie/CSRF/Origin, bound responses, and reject redirects and POST replay. Existing legacy shutdown remains supported without private Bearer disclosure.
- Dashboard title is Antigravity Companion. It has one Arabic server state and five core controls: chat, one dynamic start/stop button, diagnostics, updates and setup under a separate heading. Removed service and8765 badges/polling. Toggle focus/name/ID, duplicate-action guards and stale-result guards are tested.
- Arabic diagnostics await the result, accept only the three known checks and announce truthful success/failure; pending/raw JSON and malformed or inconsistent summaries are rejected. Legacy facade retains only appropriate native operations; openSettings now opens Android application details.
- Removed obsolete native-voice listener and disabled native-speech settings mapping. Browser speechSynthesis, WebAudio and haptics remain distinct. The speech_enabled string retained in the adapter is a rejection guard for obsolete settings, not a voice caller.
- Preserved accessible names/labels, logical keyboard Tab order, live text announcements and focus return. Controls do not communicate state by color alone. Desktop1280x900 and mobile390x844 were inspected before and after, with five48px controls and no horizontal overflow. This is local browser evidence, not TalkBack/Jieshuo acceptance.
- Preserved settings draft/revision/partial-save ownership, SSE deduplication/cancellation and no message replay, history/offline reads, CSP, Host/Origin/main-frame restrictions, update signing and private credentials.

## Acceptance tools and documentation

CLI doctor no longer requires the app AccessibilityService or8765; it retains CLI/Termux environment and server checks. Native Doctor's exact three-item contract is separate from this environment CLI.

Host run_phone_tests.py accepts phases all/dashboard/chat and retains --adb, --serial, --output, --device-dir, --timeout, --root, --model, --cwd and --resume. On-device phone_acceptance.py accepts phase chat with --report, --root, --timeout, --delay, --model, --cwd and --resume. Retired device/voice/speech-audio flags fail argument parsing before ADB. Owned process/session/SSE and no-replay guards remain; evidence stays sanitized.

The XML harness uses the named enabled/focusable composer and accepts the lean shell. Independent review found a duplicate same-label toggle could pass the first-match helper. Added failing duplicate-start and duplicate-stop cases, then changed the host acceptance check to count actual enabled matching buttons; the new cases pass by rejecting duplicates.

README and SKILL describe current operation. task.md/project_state.md/CHANGELOG.md and the current plan are updated. Original project_spec.json, references_manifest.json and tasks.md are explicitly historical; docs/phone-script-validation.md retains its old evidence behind a historical warning. No runtime version bump: owner spec1.4.0 is specification metadata. No signing, release, user data or credential changes.

## Verified results

| Check | Observed result |
|---|---|
| Python discovery, scripts/run_*tests.py | 202 tests, OK |
| Clean Gradle assembleDebug/testDebugUnitTest/lintDebug | BUILD SUCCESSFUL;46 tasks executed |
| Gradle JVM XML | 35 tests across11 suites;0 failures/errors/skips |
| Independent standalone JVM repeat | 35 tests, OK |
| Main UI + legacy native facade browser suites | Both pass independently |
| Accepted UI / Node core / Node features | Pass |
| Stream reconnect/no POST replay / settings panel / phone XML harness | Pass |
| Changed four Python tools Black79 and flake8 | Pass |
| Six changed JS/CJS syntax checks | Pass |
| Static cache revision and Android asset harness | Pass;2 packaging tests |
| Canonical runtime web mirrors and both APK web trees | 29 files byte-identical |
| APK server tree and repair page | 53 server entries and repair byte-identical to source |
| APK retired descriptors / WebSocket classes | Absent |
| Impeccable mechanical detector on start HTML/JS/CSS | Empty finding array |
| Lint | 0 errors/fatal;14 warnings |

The202 server tests remain. Optional server device protocol fixtures do not imply the Android automation service or8765 listener still exists. Correction recorded during final cleanup (2026-10-16): the old Node features checker actually loaded retired panels.js and exercised native start_voice/cancel_voice. Its previously recorded pass was historical legacy-test evidence, not proof of browser voice cancellation. The earlier description above was inaccurate; the final cleanup report records retirement of that obsolete test and migration of supported contracts to the active interface.

Debug APK measured with the same existing version/signing/toolchain configuration: baseline4,454,748 bytes; final4,256,680 bytes; reduction198,068 bytes (about4.45%). The baseline APK's affected web bytes were verified against the original snapshots before comparison. Startup latency and the owner's <100ms observation were not measured here and are not claimed.

Lint warnings: RequiresFeature4, RedundantLabel1, DataExtractionRules1, UnusedResources7 and TypographyEllipsis1. They are reported, not silently repaired outside scope.

## Checks that do not pass universally

The old run_mentions_tests.cjs still fails at line42 because its retired #prompt selector is null. The maintainer previously exempted that old test; it was not changed or disabled. The first invocation lacked its browser environment and failed before execution; the corrected invocation reproduced the known selector failure.

The generic strict/human-grade validator is a lexical scanner, not a JavaScript AST parser. Baseline comparison reproduces the same adapter Regex delimiter warning (line362 becomes360), main-ui delimiter895 and console.log1520 warning, and existing Python CLI print notices (counts0/3/1/1 for doctor/device/host/XML harness). Mirrored JS reports the same source findings. Node syntax and real browser suites pass. No claim that the generic validator is entirely green; no new blanket exemption is inferred from prior maintainer approval.

The diff tool's default is30%; an explicit100% comparison still reports start-ui.js110.32%, phone XML harness154.90% and debug_manifest277.91%, plus the identical start-ui.js mirror. This approved architectural retirement intentionally exceeds narrow bugfix budgets. The percentages are disclosed; the evidence is the exact file allowlist, exact33 retirements, original snapshots and independent semantic review, not an invented passed cap. Later bookkeeping changes can alter the manifest's own percentage.

The full staged git diff --check reports six trailing double-space Markdown hard breaks in the unchanged owner RFC (lines3–6 and132–133). Its bytes match the pinned upstream source; they are preserved. The same check excluding only that copied RFC passes. No global whitespace setting was relaxed.

Independent reviews found no remaining actionable production defect after the duplicate-toggle acceptance fix. Source receipt checks matched before final build. This is complete local implementation with disclosed inherited checker limitations; it is not a universal green-check claim.

## Remaining acceptance and publication

Real-phone launch/start/stop, TalkBack/Jieshuo navigation, Termux integration and live agy account/model behavior remain field acceptance. No phone was installed or controlled in this task. No APK release, upstream merge or startup performance claim was made. Upstream agy's internal model-request resumption contract remains separate from the verified SSE GET reconnection behavior.

Implementation commit [3abcb0e](https://github.com/kamalyaser31/antigravity-companion/commit/3abcb0eb46f92f851f1aeeb8b2aaf42396c2f6c0) was pushed to codex/refactor-phase-1. git ls-remote and PR headRefOid both matched its full hash before posting. The PR title/body now describe the lean scope. The [detailed maintainer reply](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6215146811) reports changes, verification, preserved guards and remaining field acceptance. This final documentation receipt introduces no production change.
