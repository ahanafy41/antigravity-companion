# Eliminate Server and Stream Timeouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all arbitrary timeouts, watchdog stream cancellations, and reconnect limits across the server, SSE stream, and web client so that long-running tools, subagents, and complex tasks run to completion without interruption.

**Architecture:** 
1. Upgrade server-sent events (`stream_events` in `server/application.py`) to emit structured `heartbeat` events containing active run state every 15s, keeping connections and client timestamps alive indefinitely.
2. Remove the 3-attempt reconnect cap in `server/web/api.js` and the 80-attempt (120s) fallback cap in `server/web/main-v1-adapter.js`, allowing the client to maintain and recover stream state indefinitely while `state === 'running'`.
3. Eliminate the 60s client-side watchdog cancellation in `server/web/main-ui.js` and extend backend permission wait times in `server/sessions.py` so slow or intensive tools never get killed by watchdog timeouts.

**Tech Stack:** Python 3 (aiohttp, asyncio), JavaScript (ES2022, Web Streams API, SSE), Android Assets.

**Spec:** Documented in `CODE_MAP.md` and user request on server and stream timeout elimination.

## Global Constraints

- **Accessibility**: Preserve WCAG 2.2 AAA standards, screen reader compatibility (TalkBack & Jieshuo), and clear ARIA live notifications without emoji clutter.
- **Permanent Keystore**: Never touch or regenerate `app/keystore/antigravity-release-key.jks`.
- **Termux Environment**: Ensure compatibility with Termux Python 3.14+, single-owner port 7681, and offline APK bundled assets.
- **Atomic File Edits**: Preserve existing code comments and structure; make surgical, focused updates.

## Review Focus

1. **Subagent Long Execution**: When a subagent or tool runs for > 5 minutes without returning text, ensure the SSE stream and web client do not abort or show "انقطع الاتصال".
2. **Heartbeat Event Consumption**: Ensure `: heartbeat\n\n` comments or `event: heartbeat` frames do not pollute conversation text or break SSE parsers.
3. **Infinite Polling Loop Safety**: Ensure unbounded polling in `main-v1-adapter.js` stops immediately if `controller.signal` is explicitly aborted (e.g. user clicks Stop).
4. **Backend Stale Process Preservation**: Ensure removing timeouts doesn't leak orphan processes when the user explicitly cancels or restarts.
5. **Asset Parity**: Ensure changes in `server/web/` are cleanly mirrored to `app/src/main/assets/web/`, `app/src/main/assets/server/`, and `~/.antigravity-server/`.

---

### Task 1: Structured Heartbeat Events & Unbounded SSE Reconnection

**Files:**
- Modify: `server/application.py:1015-1025`
- Modify: `server/web/api.js:140-155`
- Test: `scripts/test_streaming_resilience.py`

**Interfaces:**
- Consumes: `sessions.log(run_id)`, `log.changed.wait()`
- Produces: `event: heartbeat` SSE frame with `{"run_id": run_id, "state": run["state"], "timestamp": float}`
- Modifies: `api.events(runId, options)` to reconnect continuously while retryable errors occur and `!signal?.aborted`.

- [ ] **Step 1: Write the failing test for heartbeat event emission and unlimited reconnection**

Add test in `scripts/test_streaming_resilience.py` verifying that `stream_events` emits an explicit `heartbeat` event on timeout, and that `api.events` continues reconnecting past 3 attempts when signal is not aborted.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/test_streaming_resilience.py`
Expected: FAIL

- [ ] **Step 3: Implement structured heartbeat in `server/application.py` and unbounded retry in `server/web/api.js`**

In `server/application.py`:
```python
            try:
                await asyncio.wait_for(log.changed.wait(), 15)
            except asyncio.TimeoutError:
                await response.write(b": heartbeat\n\n")
                await send_event(
                    response,
                    {
                        "id": log.sequence,
                        "event": "heartbeat",
                        "data": {
                            "run_id": run_id,
                            "state": run["state"],
                            "timestamp": time.time(),
                        },
                    },
                )
```

In `server/web/api.js`:
Change `attempt === 3` check to allow continuous reconnects while `!options.signal?.aborted` and `retryable`. Cap the backoff delay to a maximum of 3000ms.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 scripts/test_streaming_resilience.py`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add server/application.py server/web/api.js scripts/test_streaming_resilience.py
git commit -m "fix(stream): emit structured heartbeat and allow unbounded SSE reconnection"
```

---

### Task 2: Unbounded Client Polling Fallback & Non-Destructive Stream Watchdog

**Files:**
- Modify: `server/web/main-v1-adapter.js:675-710`
- Modify: `server/web/main-ui.js:1660-1705, 1715-1730`
- Test: `scripts/run_android_web_asset_tests.py`

**Interfaces:**
- Consumes: `api.events`, `window.mainV1Fetch('/runs/<run_id>')`
- Produces: Resilient SSE stream that stays active through multi-minute tool executions without cancelling.

- [ ] **Step 1: Write failing verification test for unbounded polling and watchdog behavior**

Ensure `main-v1-adapter.js` does not cap polling at 80 attempts (120s) when `state === 'running'`, and that `main-ui.js` refreshes `lastEventReceivedAt` on heartbeat events and never cancels reader when a run is still actively generating.

- [ ] **Step 2: Run verification test**

Run: `node -c server/web/main-v1-adapter.js && node -c server/web/main-ui.js`
Expected: Syntax check passes.

- [ ] **Step 3: Implement updates in `main-v1-adapter.js` and `main-ui.js`**

In `server/web/main-v1-adapter.js`:
Change `while (!terminal.has(snapshot.state) && pollAttempts < 80 && !controller.signal.aborted)` to:
`while (!terminal.has(snapshot.state) && !controller.signal.aborted)` so polling continues as long as the backend is working on the turn.

In `server/web/main-ui.js`:
1. When parsing lines, handle `event: heartbeat` or comments to update `lastEventReceivedAt = Date.now()`.
2. In `streamWatchdog`: Remove `reader.cancel()`. Instead of killing the stream, check if the server is still healthy. If the conversation or run is still running in the background, announce a polite wait notice to the user and keep waiting rather than aborting.
3. In error recovery: increase recovery retries or keep checking until the response is completed.

- [ ] **Step 4: Run asset and web tests to verify**

Run: `python3 scripts/sync_android_web.py && python3 scripts/run_android_web_asset_tests.py`
Expected: PASS (5/5 tests pass)

- [ ] **Step 5: Commit Task 2**

```bash
git add server/web/main-v1-adapter.js server/web/main-ui.js
git commit -m "fix(client): eliminate 60s stream cancellation and remove polling attempt limit"
```

---

### Task 3: Backend Tool Permission & Turn Execution Lifespan Extension

**Files:**
- Modify: `server/sessions.py:635-645`
- Test: `scripts/run_backend_tests.py`

**Interfaces:**
- Consumes: `sessions.prompt_permission(session, run, tool_name, params)`
- Produces: Extended or non-terminating permission prompt wait window so tools requiring confirmation are not killed after 2 minutes.

- [ ] **Step 1: Write test for extended permission wait timeout in `scripts/run_backend_tests.py`**

Test that `prompt_permission` waits up to 600 seconds (10 minutes) before defaulting, giving ample time for screen reader users and background operations without prematurely issuing `SIGTERM`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 scripts/run_backend_tests.py -k test_permission_timeout`
Expected: FAIL or verifies new timeout constant.

- [ ] **Step 3: Update `server/sessions.py`**

In `server/sessions.py:640`:
Change `decision = await asyncio.wait_for(fut, timeout=120.0)` to `timeout=600.0` (10 minutes).
Additionally, ensure that if the client disconnects temporarily, `SIGTERM` is not immediately sent to the background tool process.

- [ ] **Step 4: Run backend tests to verify**

Run: `python3 scripts/run_backend_tests.py`
Expected: All backend tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add server/sessions.py scripts/run_backend_tests.py
git commit -m "fix(sessions): extend permission prompt timeout to 600s to protect long tool execution"
```

---

### Task 4: Synchronization and End-to-End Regression Verification

**Files:**
- Synchronize: `app/src/main/assets/web/`, `app/src/main/assets/server/`, `~/.antigravity-server/`
- Verify: Full test suite

- [ ] **Step 1: Synchronize all assets**

Run: `python3 scripts/sync_server_assets.py`
Verify that `app/src/main/assets/server/` and `app/src/main/assets/web/` and `~/.antigravity-server/` match.

- [ ] **Step 2: Run web asset tests**

Run: `python3 scripts/sync_android_web.py --check && python3 scripts/run_android_web_asset_tests.py`
Expected: PASS (27 verified, 5/5 tests pass).

- [ ] **Step 3: Run code map integrity test**

Run: `python3 scripts/test_code_map_integrity.py`
Expected: PASS (7/7 tests pass).

- [ ] **Step 4: Run full backend test suite**

Run: `python3 scripts/run_backend_tests.py`
Expected: PASS (all tests pass).

- [ ] **Step 5: Commit Task 4**

```bash
git add app/src/main/assets/
git commit -m "chore(sync): synchronize timeout-free server and web assets to android and termux"
```
