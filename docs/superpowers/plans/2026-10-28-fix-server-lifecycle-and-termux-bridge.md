# Fix Server Lifecycle, Termux RUN_COMMAND Bridge, and Start Dashboard State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix server start/stop operations, Termux `RUN_COMMAND` permission guidance & `startForegroundService` compliance on Android 8+/14, loopback shutdown without obsolete HMAC barriers, and real-time live status synchronization on the start dashboard.

**Architecture:** 
1. Upgrade native `TermuxBridge` to use `startForegroundService` on Android Oreo+ (API 26+) and Android 14 (API 34) with descriptive permission guidance to Android App Settings.
2. Provide a frictionless, secure loopback HTTP shutdown endpoint (`/api/shutdown` & `/api/v1/system/shutdown`) for `127.0.0.1` and `appassets` so stopping the server never requires Termux OS-level kill when HTTP is responsive.
3. Add lifecycle polling and visibility/focus listeners in `start-ui.js` with screen-reader first announcements for TalkBack and Jieshuo.

**Tech Stack:** Java (Android SDK 34, AndroidX WebKit, OkHttp), Python (aiohttp, asyncio), Vanilla JavaScript (WebMessageListener native bridge, ARIA live), Bash.

**Spec:** [docs/lean-companion-architecture-rfc.md](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/docs/lean-companion-architecture-rfc.md) and [docs/lean-companion-spec.json](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/docs/lean-companion-spec.json).

## Global Constraints

- No external dependencies added; rely solely on Android SDK 34, OkHttp, and Python standard/aiohttp library.
- Zero background accessibility service overhead; maintain the pure Lean Companion architecture.
- All modified web assets in `server/web/` must be synchronized to `app/src/main/assets/web/` and `~/.antigravity-server/web/` via `scripts/sync_android_web.py`.
- Full WCAG 2.2 and WAI-ARIA live announcements for TalkBack and Jieshuo screen readers.
- 100% pass on `scripts/test_code_map_integrity.py` and `scripts/run_shutdown_tests.py`.

## Review Focus

1. Permission rejection: When `RUN_COMMAND` is not granted, app must navigate user directly to App Settings instead of hanging for 30s.
2. Background service restrictions: Android 8+ throws `BackgroundServiceStartNotAllowedException` on `startService`; must use `startForegroundService`.
3. Loopback shutdown parity: Local loopback request from WebView or Android shell must stop the server cleanly without obsolete `android_proof` HMAC token.
4. Live status reflection: Switching from Termux back to Companion app must immediately update server status badge to active without reload.
5. Inactive server port fallback: When server port changes or is dynamically assigned, probe and dashboard must reflect the active port gracefully.

---

### Task 1: Android Native Bridge & Termux Permission Handling Upgrade

**Files:**
- Modify: `app/src/main/java/com/antigravity/companion/TermuxBridge.java:45-105`
- Modify: `app/src/main/java/com/antigravity/companion/MainActivity.java:420-435`
- Modify: `app/src/main/java/com/antigravity/companion/NativeBridgePolicy.java:8-15`
- Test: `app/src/test/java/com/antigravity/companion/TermuxLaunchContractTest.java`

**Interfaces:**
- Consumes: `Context.checkSelfPermission("com.termux.permission.RUN_COMMAND")`
- Produces: `TermuxBridge.dispatchServiceCommand(Context, Intent)`, `MainActivity.openAppSettings()`, `actions.put("open_app_settings", ...)`

- [ ] **Step 1: Write test for Android O+ foreground service launching contract**

Verify that `TermuxBridge` prepares intents correctly and checks API version for foreground dispatch.

- [ ] **Step 2: Run test to verify behavior**

Run: `python scripts/run_launcher_tests.py`
Expected: PASS (or verifies current launcher contract)

- [ ] **Step 3: Update `TermuxBridge.java` for Android 8+/14 Foreground Service**

In `TermuxBridge.java`, replace raw `context.startService(...)` with:
```java
private static void startCommandService(Context context, Intent intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent);
    } else {
        context.startService(intent);
    }
}
```
Apply across `startServer`, `stopServer`, and `startInteractive`. Add specific error handling for `SecurityException` providing human-readable description.

- [ ] **Step 4: Update `MainActivity.java` with App Settings Navigation**

In `MainActivity.java`:
1. Add `openAppSettings(NativeRequest request)`:
```java
private void openAppSettings(NativeRequest request) {
    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
    intent.setData(Uri.parse("package:" + getPackageName()));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    startActivity(intent);
    showStatus("تم فتح إعدادات التطبيق؛ يرجى تفعيل إذن تشغيل أوامر Termux من الأذونات الإضافية");
    if (request != null) reply(request, flag("opened", true));
}
```
2. Register action in `registerActions()`: `actions.put("open_app_settings", this::openAppSettings);`
3. Update `NativeBridgePolicy.java` to include `"open_app_settings"` in `LOCAL_CONTROLS`.
4. In `launchTermux()`, if `checkSelfPermission` fails:
   - Call `openAppSettings(null);`
   - Fallback: launch Termux application directly via `getPackageManager().getLaunchIntentForPackage(TERMUX_PACKAGE)` so the user can see Termux immediately.

- [ ] **Step 5: Verify integration & commit**

```bash
git add app/src/main/java/com/antigravity/companion/TermuxBridge.java app/src/main/java/com/antigravity/companion/MainActivity.java app/src/main/java/com/antigravity/companion/NativeBridgePolicy.java
git commit -m "fix(android): upgrade TermuxBridge to startForegroundService and add app settings navigation"
```

---

### Task 2: Robust Loopback Shutdown in Server & ServerConnection

**Files:**
- Modify: `server/application.py:180-195` & `server/application.py:1365-1375`
- Modify: `server/security.py:110-130`
- Modify: `app/src/main/java/com/antigravity/companion/ServerConnection.java:60-95`
- Test: `scripts/run_shutdown_tests.py`

**Interfaces:**
- Consumes: `POST /api/v1/system/shutdown`, `POST /api/shutdown`
- Produces: Clean, authorization-free loopback shutdown for local requests from `127.0.0.1` and `appassets`.

- [ ] **Step 1: Write test verifying loopback shutdown without HMAC**

In `scripts/run_shutdown_tests.py`, add test case asserting that a local loopback POST to `/api/shutdown` or `/api/v1/system/shutdown` returns 202 Stopping without requiring HMAC or session tokens.

- [ ] **Step 2: Run test to observe failure on current server**

Run: `python scripts/run_shutdown_tests.py`
Expected: Catch failure if endpoint requires CSRF or is missing.

- [ ] **Step 3: Implement `/api/shutdown` route and loopback exception in `security.py`**

In `server/application.py`:
1. Register `web.post("/api/shutdown", shutdown_server)` in application routes.
2. In `shutdown_server(request)`:
   Ensure `callback` initiates graceful shutdown.
3. In `server/security.py`:
   Allow `/api/shutdown` and `/api/v1/system/shutdown` if `ip_address(request.remote).is_loopback` or origin is `https://appassets.androidplatform.net`.

- [ ] **Step 4: Update `ServerConnection.java` to use streamlined loopback shutdown**

In `app/src/main/java/com/antigravity/companion/ServerConnection.java`:
Update `stopLegacy()` and `stopModern()`:
```java
void stopServerDirect() throws IOException {
    Request request = new Request.Builder()
            .url(origin + "/api/shutdown")
            .header("Origin", origin)
            .post(oneShotJson())
            .build();
    try (Response response = client.newCall(request).execute()) {
        if (!response.isSuccessful() && response.code() != 202) {
            throw new IOException("Shutdown request returned: " + response.code());
        }
    }
}
```
Update `MainActivity.java` `stopServer` to call `server.stopServerDirect()` before falling back to `TermuxBridge.stopServer`.

- [ ] **Step 5: Run tests and commit**

Run: `python scripts/run_shutdown_tests.py`
Expected: PASS
```bash
git add server/application.py server/security.py app/src/main/java/com/antigravity/companion/ServerConnection.java app/src/main/java/com/antigravity/companion/MainActivity.java
git commit -m "fix(server): enable robust loopback HTTP shutdown without obsolete HMAC dependencies"
```

---

### Task 3: Start Dashboard Real-Time Status Synchronization & Accessibility

**Files:**
- Modify: `server/web/start-ui.js:25-95` & `server/web/start-ui.js:225-267`
- Modify: `server/web/start.html:20-45`
- Modify: `server/web/main-v1-adapter.js:10-30`
- Test: `scripts/run_settings_panel_tests.py`

**Interfaces:**
- Consumes: `window.AntigravityBridge.isTermuxServerReady()`, `window.AntigravityBridge.openAppSettings()`
- Produces: Polling interval (3s), `visibilitychange` & `focus` event handlers, accessible TalkBack status toasts.

- [ ] **Step 1: Write UI test for status update on focus & visibility**

Verify that `checkStatus()` is invoked upon `visibilitychange` (`!document.hidden`) and `window.focus`.

- [ ] **Step 2: Add `openAppSettings` bridge wrapper in `main-v1-adapter.js`**

Add to `global.AntigravityBridge`:
```javascript
openAppSettings: () => native('open_app_settings'),
```

- [ ] **Step 3: Update `start-ui.js` with Lifecycle Polling & Event Listeners**

In `server/web/start-ui.js`:
1. Add visibility and focus event listeners:
```javascript
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkStatus();
});
window.addEventListener('focus', () => checkStatus());
```
2. Add safe, adaptive polling loop when page is active:
```javascript
setInterval(() => {
    if (!document.hidden && !serverBusy) {
        checkStatus();
    }
}, 4000);
```
3. Update `changeServerState(true)` when Termux execution is blocked:
   If startup times out or fails, announce:
   `"تعذر تشغيل الخادم تلقائياً. تأكد من تفعيل إذن تشغيل أوامر Termux من إعدادات التطبيق أو شغّله يدوياً من Termux."`
   Add a quick-action button to open App Settings if permission is missing.

- [ ] **Step 4: Synchronize web assets across project mirrors**

Run: `python scripts/sync_android_web.py`
Verify: All mirrors in `app/src/main/assets/web/` and `~/.antigravity-server/web/` match `server/web/`.

- [ ] **Step 5: Verify and commit**

```bash
git add server/web/start-ui.js server/web/start.html server/web/main-v1-adapter.js app/src/main/assets/web/
git commit -m "feat(ui): add real-time status polling, visibility listeners, and permission guidance to start screen"
```

---

### Task 4: Full End-to-End Verification & Health Inspection

**Files:**
- Test: `scripts/test_code_map_integrity.py`
- Test: `scripts/run_backend_tests.py`
- Test: `scripts/doctor.py`

**Interfaces:**
- Consumes: All updated native bridge methods, server routes, and web assets.
- Produces: 100% test pass evidence.

- [ ] **Step 1: Run code map integrity test**

Run: `python scripts/test_code_map_integrity.py`
Expected: 7 passed, 0 failures.

- [ ] **Step 2: Run backend test suite**

Run: `python scripts/run_backend_tests.py`
Expected: All backend unit and routing tests pass.

- [ ] **Step 3: Run companion doctor diagnostic**

Run: `python scripts/doctor.py`
Expected: Reports clean configuration and healthy ports.

- [ ] **Step 4: Final verification commit**

```bash
git add -A
git commit -m "chore: complete server lifecycle, permission guidance, and start status verification"
```
