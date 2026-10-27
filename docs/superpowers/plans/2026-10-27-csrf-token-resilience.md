# CSRF Token Resilience and Self-Healing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently eliminate the intermittent "CSRF token is required" error across the Companion Web Studio and Android WebView by implementing dual-layer server-side token grace validation and automatic client-side self-healing request retries.

**Architecture:** The server-side security middleware is enhanced with active-session grace validation to tolerate out-of-sync cookie rotations caused by Android bootstrap restarts. On the client side, the API transport layer is equipped with an automatic interceptor that intercepts 403 `csrf_failed` responses, invalidates stale tokens, fetches a fresh token via `/api/v1/auth/session`, and transparently replays the failed mutation without interrupting the user.

**Tech Stack:** Python 3.10+ (aiohttp), Vanilla JavaScript (ES2022 / CommonJS), Android WebView CookieManager.

**Spec:** `scratch/antigravity-companion-app/server/security.py`, `server/web/api.js`, `server/web/main-v1-adapter.js`.

## Global Constraints

- Never weaken or disable origin isolation (`https://appassets.androidplatform.net`, `localhost`, `127.0.0.1`) or local host verification.
- Preserve 100% backward compatibility with Android Companion App bootstrap protocol and standard browser pairing.
- Zero external client dependencies (vanilla JavaScript exclusively).
- All 52 backend tests and web test suites must pass 100% with zero regressions.

## Review Focus

1. **Android Bootstrap Cookie Desynchronization**: Native Android `bootstrapCookie()` rotates the `agy_session` cookie on app resume/reconnect while JavaScript in WebView holds the previous CSRF token.
2. **Cold Start / Glitch Empty Token**: If `/api/v1/auth/session` fails once on initial page load, `csrfToken` must not remain an empty string indefinitely without retry.
3. **Reconnection Stale Connection Promise**: In `main-v1-adapter.js`, a 403 error must invalidate the cached `connection` promise just like 401 does.
4. **Transparent Single-Flight Replay**: When a mutation fails with 403 `csrf_failed`, the replay must occur at most once per request to prevent infinite retry loops.
5. **Screen Reader Notification**: Transient 403 errors that recover automatically within the retry must never announce "CSRF token is required" to TalkBack or Jieshuo.

---

### Task 1: Server-Side Dual-Layer CSRF Grace Validation in `server/security.py`

**Files:**
- Modify: `server/security.py:126-144`
- Test: `scripts/run_backend_tests.py`

- [x] **Step 1: Write failing test in `scripts/run_backend_tests.py`**
  Add `test_csrf_grace_period_accepts_recently_active_token_during_cookie_rotation` to `StorageTests` verifying that when a cookie is rotated, a valid CSRF token from an active session is accepted without throwing 403 `csrf_failed`.
- [x] **Step 2: Run test to confirm failure**
- [x] **Step 3: Implement grace validation in `server/security.py`**
- [x] **Step 4: Run backend tests to verify pass**
  Run `python3 scripts/run_backend_tests.py` (all 52 tests pass).
- [x] **Step 5: Commit**
  `git commit -m "fix(security): tolerate active CSRF tokens during cookie rotation transition"`

---

### Task 2: Client-Side Automatic CSRF Self-Healing & Request Replay in `server/web/api.js`

**Files:**
- Modify: `server/web/api.js:24-60`
- Test: `server/web/run_tests.cjs`

- [x] **Step 1: Write test for automatic 403 CSRF recovery in `server/web/run_tests.cjs`**
- [x] **Step 2: Run test to confirm failure**
- [x] **Step 3: Implement self-healing in `server/web/api.js`**
- [x] **Step 4: Run test to confirm pass**
  Run `node server/web/run_tests.cjs` (passed).
- [x] **Step 5: Commit**
  `git commit -m "fix(csrf): add automatic self-healing retry on 403 and connection reset"`

---

### Task 3: Adapter Resiliency on 403 & Connection Reset in `server/web/main-v1-adapter.js`

**Files:**
- Modify: `server/web/main-v1-adapter.js:230-234`
- Test: `server/web/run_features_tests.cjs`

- [x] **Step 1: Update error handling in `main-v1-adapter.js`**
- [x] **Step 2: Sync files to runtime & assets**
- [x] **Step 3: Run comprehensive verification suites**
  - `python3 scripts/run_backend_tests.py` (52 tests passed)
  - `python3 scripts/run_android_web_asset_tests.py` (5 tests passed)
  - `node server/web/run_tests.cjs` (passed)
- [x] **Step 4: Commit**

---

### Task 4: Live Server Restart & Full Verification

**Files:**
- Runtime: `~/.antigravity-server/launch_server.sh`

- [x] **Step 1: Restart runtime server on port 7681**
  Execute `bash ~/.antigravity-server/launch_server.sh`.
- [x] **Step 2: Verify server health & CSRF exchange via curl**
- [x] **Step 3: Verification before completion**
