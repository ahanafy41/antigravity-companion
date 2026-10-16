# refactor: complete local simplification and settings ownership

Date: 2026-10-16
Status: approved_for_execution_by_user; user explicitly instructed full implementation, push and maintainer comment after reviewing this specification.
Baseline: c35d20084553d83e80829f85de66c57aa027162e.

## Authority and interpretation

The user clarified that the intended work is phase 2 (local simplification) and phase 3 (settings ownership), preserving phase 4 (security and persistence invariants), and approved the proposed adapter-owned design. The user subsequently explicitly authorized implementation and publication beyond the previous freeze. It is not a new written maintainer approval or permission to merge main, install on a phone, or publish a release.

Reference phases: [maintainer phase list](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6195701813). Previous restrictions: [scoped directive](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6195796462) and [freeze](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6202018307). Existing implementation: [scoped follow-up](scoped-maintainer-follow-up-report.md). Plugin fix/sign-off: [report](plugin-toggle-fix-report.md).

This specification is grounded in the existing audit and implementation documents; it does not claim a fresh source audit. Before editing production code, verify each candidate's live call sites, current bytes and exact location in a locked manifest. If that reveals a different contract, revise this specification before implementation.

## Goal

Remove confirmed redundant local work and give the current adapter one authoritative server-settings snapshot, without changing the accepted interface, user configuration, external API, or safety guarantees.

## Approach selection

1. Recommended: small edits in existing modules, reusing the adapter's existing settings/policy documents and revisions. No new store, framework or dependency.
2. A shared new state-store module would add a second abstraction and migration surface; reject unless the existing adapter cannot own the contract.
3. Rewriting the settings engine or frontend creates unnecessary compatibility and accessibility risk; exclude.

## Phase 2: finish local simplification

Already delivered: remove ignored listing --help, and reuse the successful server availability probe. Keep these fixes; do not implement them again. Mutation help that supplies real supported flags remains.

Review the following remaining candidates independently before locking their edit manifests:

- Audit item 8: remove an ignored post-mutation MCP listing only if every caller is accounted for and the owning settings listing still provides the required result. Successful mutation must not appear to fail solely because an unused refresh failed. Preserve actual mutation errors, scope/cwd/owner/revision and no automatic mutation replay.
- Audit item 21: remove only proven unused private remnants, such as the previously reported unmounted status field and uncalled private voice helper. Do not remove public/Intent compatibility, accessibility announcements, native controls, or change MainActivity layout/lifecycle. If an external or live caller exists, retain the item and record why.
- Audit item 22: retain a single Service Worker registration owner in the adapter, preserving bundled-origin exclusion, error reporting, offline startup and API cache exclusion. Do not delete or shrink the runtime asset set.

No polling redesign, transcript pruning, synthetic SSE redesign, signature optimization, ledger optimization, broad popup/card refactor, or removal of the retired asset stack is included in phase 2.

## Phase 3: settings ownership

- main-v1-adapter.js owns the last accepted server settings document and its revision. Its policy document and independent policy revision stay separate; never merge revisions from different API resources.
- main-ui.js owns a local draft, its editing baseline, and dirtyFields. Its baseline is a comparison snapshot, not a competing server cache. Do not replace unsaved user edits when a refresh or another window notification arrives.
- An incoming BroadcastChannel notification invalidates the adapter's server snapshot and triggers refresh through the same owner. The notification is not trusted as a complete replacement document or authoritative revision. Preserve any existing transport fallback; no new cross-window dependency.
- Initial loading, explicit refresh, post-save refresh and existing scheduled refresh use that same ownership path. Preserve polling timing unless eliminating a duplicate fetch within that path is necessary and documented.
- Do not let an older GET completion overwrite a newer accepted server snapshot. Coalesce redundant in-flight refreshes where safe; invalidate stale responses across intervening saves. Do not assume a numeric revision unless the existing API proves it.
- PATCH contains edited known fields only. Preserve unknown server keys, secrets, user configuration and CLI-owned settings. Existing field validation stays.
- Save uses the revision matching the user's editing baseline. A remote change must not silently advance the draft revision and allow overwriting newer data. On conflict, retain the draft and show the existing accessible conflict feedback; require deliberate reload/reconciliation rather than blind retry.
- On successful save, accept the returned document/revision through the owner; clear only edits actually saved, preserving any edits made while the request was running. Notify other windows using the existing channel and avoid refresh/notification loops.
- A failed/offline refresh preserves the last accepted state and draft and reports the failure truthfully. Do not show an unsaved edit as saved. Do not replay a mutation with an unknown outcome.
- Catalog refresh for models/agents remains separate from settings persistence; failure of a catalog refresh must not erase configuration or report a successful settings write as failed.

## Planned production boundaries

| File | Allowed responsibility |
|---|---|
| server/cli_client.py; server/application.py only if a current caller requires it | ignored post-mutation MCP listing candidate |
| app/src/main/java/com/antigravity/companion/MainActivity.java | proven private dead remnants only; no layout/lifecycle refactor |
| server/web/main-v1-adapter.js | settings/policy snapshot ownership and existing SW registration ownership |
| server/web/main-ui.js | draft/dirty/baseline integration and removal of duplicate SW registration |
| app/src/main/assets/web mirrors | exact build-generated mirrors of changed canonical runtime files |
| server/web/sw.js and its mirror | derived cache revision generated by the existing release preparation |

Existing relevant test scripts receive only meaningful regressions for changed behavior. Exact script selection and line pinpoints belong in the implementation plan after written-spec review and live inspection. No invented function names or stale line-number promises.

## Phase 4: invariants

Preserve HMAC, CSRF, strict Origin/Host and native main-frame guards; signature/identity/version checks; secret masking and blank-secret preservation; atomic writes and fsync; journal epoch, action ownership, cancellation and no replay of unknown effects. Preserve distinct synchronous legacy and asynchronous modern bridges, the accepted fullscreen/start interface, LEGACY server compatibility, genuine loopback access and all runtime assets. No production configuration/version/signing changes or new dependencies.

## Acceptance cases

1. Each phase-2 removal preserves its real return/error contract; MCP success does not depend on an ignored listing, and required listing errors remain visible where actually consumed.
2. A single SW registration path handles online/offline startup and bundled origin, preserves cache policy, and has visible failure reporting.
3. Edit one field while the server contains unknown fields; PATCH changes only the intended field and preserves the rest.
4. Two windows edit the same baseline; after one saves, the other cannot silently overwrite its change with a refreshed revision. Conflict feedback retains its unsaved draft.
5. A slow GET completes after a save or a newer refresh; it cannot restore stale document/revision.
6. A second local edit during save remains dirty afterward; duplicate save/refresh events do not replay mutation or form notification loops.
7. Offline refresh, failed save, malformed response and independent policy revision leave consistent, truthful state without discarding user input or secrets.
8. Catalog refresh failures do not erase settings or misreport save success.
9. Existing keyboard order, accessible labels, focus restoration and non-color-only error communication remain; physical TalkBack/Jieshuo acceptance is distinct from local tests.
10. Existing relevant Python/JVM/browser suites, syntax/style checks, diff checks, SW/mirror checks and Debug/Lint pass for changed contracts. Prior exemptions are reported explicitly and not automatically extended to new failures.

## Sequence and delivery

First review this written specification. Then prepare the implementation plan and exact manifests from live evidence. Keep phase-2 candidates and phase-3 ownership changes independently verifiable. Planning, implementation and verification can be divided among agents without shared-file writers; no delegation is required merely to fill process slots.

Before each production edit: manifest, applicable approval, backup and focused failing regression where meaningful. Review changed code/tests/docs before commit. User authorization and maintainer approval must be stated separately; send any new manifest for maintainer review before claiming maintainer sign-off. No push, merge, release or phone installation is part of this specification-writing step.
