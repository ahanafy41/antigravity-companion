# Frontend Accessibility & UI Engineering Report

## Delivered Enhancements
Upgraded `server/web/index.html` (and mirrored to `app/src/main/assets/`):

1. **Extended Dynamic Settings (`DynamicSettingsEngine`)**:
   - **Execution Mode (`--mode`)**: Added `field-mode` dropdown supporting `accept-edits` (Direct Execution) and `plan` (Strategic RFC Planning).
   - **Reasoning Effort**: Added `max` (Maximum Reasoning) alongside `low`, `medium`, and `high`.
   - **Terminal Sandbox (`--sandbox`)**: Added accessible switch with red boundary accent.
   - **Non-Workspace Access (`allowNonWorkspaceAccess`)**: Added accessible switch with purple boundary accent.
   - **Auto-Approved Whitelist Manager**: Added interactive cards for every auto-approved command rule in `permissions.allow` with individual delete buttons and ARIA live feedback.
   - **Antigravity CLI Version & System Update Card**: Displays live `agy` CLI binary version with an immediate one-click update button and `aria-live="polite"` feedback.

2. **Plugins Center (`#plugins-dialog`)**:
   - Added drawer menu item `btn-open-plugins` with accessibility label and badge.
   - Created accessible modal dialog `#plugins-dialog` with WCAG ARIA roles (`role="dialog"`, `role="list"`, `role="listitem"`, `aria-modal="true"`).
   - Integrated full asynchronous state management calling `GET /api/plugins/list` and `POST /api/plugins/toggle`.
   - TalkBack & Jieshuo friendly audible announcements via `announce()` on toggling plugins.
