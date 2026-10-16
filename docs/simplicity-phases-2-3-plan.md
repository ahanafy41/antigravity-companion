# refactor: simplicity phases 2 and 3 implementation plan

Goal: complete approved local cleanup and adapter-owned settings while preserving phase-4 invariants.
Spec: [approved design](simplicity-phases-2-3-design.md). Baseline c35d200. User explicitly approved full implementation, push and maintainer comment after the written specification. Source manifest: ../debug_manifest.json. Supervisor approval of this expanded scope is not claimed.

## Task 1 — local work removal

Files: server/cli_client.py CLI.mutate_mcp:231-253; scripts/run_process_tests.py ScopedMCPTests:163-188; MainActivity.java unused import/status at21-90 and private acceptVoice:501-506.
- [x] Pin regression for successful MCP mutation with failing unused listing, preserve cwd and actual command error; assert no duplicate mutation.
- [x] Run it before production changes, then remove the ignored listing only; application.py sole caller already returns the owner listing, so preserve it unchanged unless fresh evidence requires otherwise.
- [x] Remove only the proven orphan TextView and uncalled private acceptVoice; retain JS announcement and Intent/dictation flow.
- [x] Run process/Python tests and native build/JVM checks.

## Task 2 — settings ownership and SW

Files: main-v1-adapter.js settings/saveSettings/dispatch/mainV1 seams; main-ui.js DynamicSettingsEngine and duplicate service-worker registration; existing run_main_ui_tests.cjs extended with ownership regressions.
Consumes existing request/ApiError/GET settings and CLI policy/PATCH contracts. Produces adapter-owned accepted settings/policy view and explicit editor-baseline metadata through existing facade (no server API change). Exact internal helper names are chosen in those existing seams, not a new module.
- [x] Add and run failing behavioral cases: window refresh must not bypass owner; stale draft uses original revision; delayed GET cannot undo a save; edit during save remains dirty; catalog/offline failure cannot erase drafts or misreport accepted writes.
- [x] Coalesce safe reads and guard acceptance by request generation; keep settings/policy revisions independent, clone baselines and serialize settings mutations without replay.
- [x] Editor retains draft/dirty state and its original conflict baseline; successful save clears only the submitted unchanged edits; reset deliberately reconciles to the accepted owner snapshot.
- [x] Broadcast invalidates and refetches through owner, ignores payload as authority; preserve unsaved edits and avoid notification loops. Immediate model/effort/tones callers continue to work.
- [x] Keep adapter SW registration and remove only duplicate main-ui registration.
- [x] Run focused ownership, main UI, accepted UI and remaining browser regressions; preserve prior explicit exemptions as disclosed, not as passing tests.

## Task 3 — independent review, packaging and delivery

- [x] Independently review production/tests using clean-code-guard/test-guard and inspect exact backup diff scope.
- [x] Run Python/JVM/browser suites, Black79/flake8 for changed Python, JS syntax, generic validator and diff verifier. Disclose generic-validator limitations rather than hiding failures or changing the tool.
- [x] Build Debug/Lint with existing toolchain, regenerate cache and byte-identical mirrors, verify all runtime assets in both APK trees. No runtime asset deletion.
- [x] Update task.md/project_state.md/CHANGELOG.md/SKILL.md and the report with actual checks and limits; distinguish user authorization from maintainer acceptance and phone testing.
- [x] Commit/push the current PR branch at user request; verify remote head; post a concrete maintainer comment describing scope, tests, caveats and implementation links. No merge/release/install.

Execution: isolated discovery/implementation/review agents may handle independent parts; settings files have one writer, root owns integration/build/docs/Git. Existing branch and unrelated modifications remain intact.
