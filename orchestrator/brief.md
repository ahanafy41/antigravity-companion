# Project Brief: Antigravity Companion Settings & API Comprehensive Bridge

## 1. Context & Objective
The user (Ahmed) requires that all settings and capabilities of Antigravity CLI (both older features and latest updates)—which currently are controlled via terminal—become fully manageable directly from the Antigravity Companion app.

Active Workspace: `/data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app`

## 2. Invariants & Accessibility Rules
- Strict Screen Reader Compatibility: Full support for TalkBack and Jieshuo (CSR) screen readers.
- Semantic HTML and WCAG WAI-ARIA standards (`role="switch"`, `aria-checked`, `aria-live="polite"`, descriptive labels, no unlabeled or purely visual elements).
- Preserving Antigravity configurations: Zero destructive overwrites in `~/.gemini/antigravity-cli/settings.json` or `~/.gemini/config/config.json`.
- Performance: Light on Termux resources; non-blocking asynchronous operations.

## 3. Scope of Work
### Backend (`server/server.py`)
1. Extend `load_settings()` and `save_settings()`:
   - Support `mode` (`accept-edits` vs `plan`).
   - Support reasoning effort `max` alongside `low`, `medium`, `high`.
   - Support `sandbox` (boolean).
   - Support `allowNonWorkspaceAccess` (boolean).
   - Protect fine-grained permissions: Keep existing `permissions.allow` rules (e.g. `command(...)`) intact when updating global category toggles.
2. Update `PersistentAiSession`:
   - Pass `--mode` when set.
   - Pass `--sandbox` when enabled.
   - Support `max` effort.
3. Add New API Endpoints:
   - Plugins: `GET /api/plugins/list`, `POST /api/plugins/toggle`
   - Permissions Whitelist: `GET /api/ai/permissions/whitelist`, `POST /api/ai/permissions/whitelist/remove`
   - System Version & Update: `GET /api/system/version`, `POST /api/system/update`

### Frontend (`server/web/index.html`)
1. Update `DynamicSettingsEngine.getSchema()`:
   - Add `mode` select (`accept-edits` / `plan`).
   - Add `max` reasoning effort option.
   - Add `sandbox` switch.
   - Add `allowNonWorkspaceAccess` switch.
   - Add interactive Whitelist manager for auto-approved commands.
2. Add Plugins Management:
   - Add drawer button `btn-open-plugins` with badge and accessibility labels.
   - Add accessible dialog `#plugins-dialog` with switches for each plugin (e.g., `user-profile`) and live feedback (`aria-live="polite"`).
3. Add System Update integration:
   - Display CLI version and update trigger with accessible status indicator.
