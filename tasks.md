# Antigravity Companion & Bridge - Execution Tasks

## Phase 1: Project Scaffolding & Permissions
- [ ] Initialize Android project skeleton with Gradle (minSdk 24, targetSdk 34, compileSdk 34).
- [ ] Declare permissions in `AndroidManifest.xml` (`android.permission.BIND_ACCESSIBILITY_SERVICE`, `com.termux.permission.RUN_COMMAND`, `android.permission.INTERNET`).
- [ ] Configure `res/xml/accessibility_service_config.xml` with `canRetrieveWindowContent="true"`, `canPerformGestures="true"`, `canTakeScreenshot="true"`.

## Phase 2: Accessibility Automation Core (`AntigravityAccessibilityService`)
- [ ] Implement service lifecycle hooks (`onServiceConnected`, `onAccessibilityEvent`, `onInterrupt`, `onDestroy`).
- [ ] Implement window hierarchy traversal using `getRootInActiveWindow()` and `getRootInActiveWindow_prefetching(int)`.
- [ ] Implement node manipulation with `AccessibilityNodeInfo.performAction(int, Bundle)` for click, focus, scroll, and set-text.
- [ ] Implement `performGlobalAction(int)` dispatcher for Back, Home, Recents, Notifications, and Lock Screen.
- [ ] Implement `dispatchGesture(GestureDescription, GestureResultCallback, Handler)` for multi-point touch strokes.
- [ ] Implement `takeScreenshot(int, Executor, TakeScreenshotCallback)` for API 30+ HardwareBuffer acquisition.

## Phase 3: Termux RUN_COMMAND Bridge (`TermuxBridgeManager`)
- [ ] Build explicit intent dispatcher targeting `com.termux/com.termux.app.RunCommandService` with `ACTION_RUN_COMMAND`.
- [ ] Map execution parameters into extras (`EXTRA_COMMAND_PATH`, `EXTRA_ARGUMENTS`, `EXTRA_WORKDIR`, `EXTRA_BACKGROUND=true`).
- [ ] Implement `PendingIntent` callback receiver with `FLAG_MUTABLE` to capture stdout, stderr, and exit codes.
- [ ] Add payload size guard with fallback to `EXTRA_RESULT_DIRECTORY` for large responses.

## Phase 4: Duplex Local WebSocket IPC Server (`CompanionWebSocketServer`)
- [ ] Initialize RFC 6455 `WebSocketServer` bound exclusively to `127.0.0.1:8765` running on a background executor.
- [ ] Implement JSON-RPC 2.0 command parser and dispatcher for actions (`ping`, `get_window_tree`, `click_node`, `input_text`, `dispatch_gesture`, `take_screenshot`, `run_termux_command`).
- [ ] Implement connection lifecycle handling, client registry, error reporting, and thread-safe broadcast channels.

## Phase 5: Accessible WebView UI & Screen Reader Dashboard (`MainActivity`)
- [ ] Configure `WebView` with `WebSettings` (`setJavaScriptEnabled(true)`) and inject `JavascriptInterface` (`window.AntigravityBridge`).
- [ ] Build WCAG 2.2 AAA / TalkBack / Jieshuo compliant dashboard with `aria-live="polite"` dynamic notification container.
- [ ] Ensure full keyboard navigation (`tabindex="0"`, `role="button"`) and zero decorative emoji noise.
- [ ] Expose two-way IPC between WebView UI and underlying native bridge.

## Phase 6: Diagnostic Tooling & Quality Assurance
- [ ] Implement `DoctorDiagnosticEngine` checking accessibility service status, Termux permission, `termux.properties`, and port 8765.
- [ ] Expose self-check CLI / broadcast trigger (`ACTION_DOCTOR`) returning actionable JSON diagnosis.
- [ ] Execute unit tests and run AST/craftsmanship validation via `validate_code.py`.

## Phase 7: GitHub Actions CI/CD & Automated APK Delivery
- [ ] Create `.github/workflows/build-apk.yml` with JDK 17, Android SDK 34, and Gradle assembly.
- [ ] Configure automatic APK artifact upload on push and manual trigger (`workflow_dispatch`).
- [ ] Provide setup instructions and git repository initialization for immediate 1-click cloud build.

