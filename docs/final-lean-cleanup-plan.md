# refactor: final lean cleanup plan

2026-10-16. User explicitly authorizes maintainer comment6220674524. Baseline684f179; debug_manifest.json fixes the allowlist and pre-mutation/protected hashes. Existing source contracts and native/web test behavior own implementation; no new dependency/API/framework.

- [x] Read final scope and actual callers; lock snapshots, allowlist and untouched server/launcher/frontend/security hashes.
- [x] Remove orphan isPortOpen and its unused imports; remove four unused strings and three unused colors. Keep app_name and active attribution in HTML.
- [x] Retire only app.js/panels.js in canonical and Android mirrors using recoverable moves; remove exactly their two static allowlist entries. Preserve state.js/ui.js/styles.css and all other routes.
- [x] Migrate run_features_tests.cjs to active adapter contracts, and run_settings_panel_tests.py to actual current HTML/API/adapter/mainUI; preserve supported policy/session/task/auth/OAuth/no-replay regressions. Existing scheduling server tests remain. Explicitly retire tests of previously removed native voice and old-only scheduling UI; do not fabricate equivalent current controls. Add password-type assertion to existing actual OAuth browser case.
- [x] Run independent production/test/docs review; targeted browser/Node/Python tooling, allPython202, JVM35, cleanDebug/Lint and packaging byte/retirement checks. State old mentions/text-validator limits truthfully.
- [x] Update task/project state/SKILL/CHANGELOG and final report; correct inaccurate old features-voice description explicitly.
- [ ] Commit/push current PR branch, verify remote head, detailed maintainer reply and publication receipt. No release/phone install/merge.

The seven resources named loosely as strings in the finalcomment are the previously approved4strings+3colors. Native speech UI/listener are already absent; retain speech_enabled as a rejection guard. Transcript/artifacts work is fully deferred; no copying from preview/refactor-test.
