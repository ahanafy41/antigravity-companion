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
- [x] Create `.github/workflows/build-apk.yml` with JDK 17, Android SDK 34, and Gradle assembly.
- [x] Configure automatic APK artifact upload on push and manual trigger (`workflow_dispatch`).
- [x] Provide setup instructions and git repository initialization for immediate 1-click cloud build.

## Phase 8: Termux Package Visibility & Smart Server Auto-Wake (BUG-A11Y-TERMUX-001)
- [x] Add `<queries>` tag in `AndroidManifest.xml` for `com.termux` package visibility on Android 11+ (API 30+).
- [x] Add robust filesystem and intent fallback detection in `DoctorDiagnosticEngine.isPackageInstalled`.
- [x] Add runtime permission request for `com.termux.permission.RUN_COMMAND` in `MainActivity.onCreate`.
- [x] Expose `isTermuxServerReady`, `isAutomationServerReady`, and `loadChatUrl` in `AntigravityJsBridge`.
- [x] Separate status reporting for internal Automation Server (8765) and Termux Chat Server (7681) in `index.html`.
- [x] Implement non-blocking auto-wake, polling, and `aria-live` accessible notifications in `goToChat()`.
- [x] Verify AST integrity, human-grade craftsmanship, and diff verification via `validate_code.py` and `diff_verifier.py`.

## Phase 9: Direct Port 7681 Verification & Clean TermuxBridge Execution (BUG-PGREP-FALSE-POSITIVE-002)
- [x] Replace flaky `pgrep` check with direct socket check on port 7681 in `launch_server.sh`.
- [x] Add explicit `EXTRA_SESSION_ACTION = "0"` in `TermuxBridge.java` according to official Termux RUN_COMMAND specification.
- [x] Streamline `ensureServerRunningAsync` to invoke `launch_server.sh` directly without noisy bash wrapper arguments.
- [x] Verify AST integrity, human-grade craftsmanship, and diff verification via `validate_code.py` and `diff_verifier.py`.
- [x] Commit and push changes to trigger automated GitHub Actions build.

## Phase 10: Zero-Friction Hidden Server Architecture & Universal Automated Setup (REQ-009)
- [x] Package clean Python server and web assets in `server/` (excluding Lua files entirely).
- [x] Bundle `server/` into APK `assets/server/` as local offline resilience fallback.
- [x] Create idempotent `setup.sh` orchestrating Termux security properties, package updates, hidden directory `~/.antigravity-server/` deployment, port 7681 test, and ending with `agy` interactive login.
- [x] Update `TermuxBridge.java` to target `~/.antigravity-server/launch_server.sh` with seamless fallback.
- [x] Add 1-click 'Copy Termux Setup Code & Launch Terminal' button to companion dashboard.
- [x] Pass automated AST validation and diff verification via `validate_code.py` and `diff_verifier.py`.
- [x] Deploy to GitHub repository and trigger automated CI/CD APK build.
## Phase 11: Accessible In-App Authentication Wizard & PTY Subprocess Bridge (REQ-010)
- [x] Task 1: Implement `InteractivePTYAuthManager` in `server/server.py` using `pty.openpty()` and `os.login_tty()` to spawn `agy` in a virtual terminal, intercepting login URLs, auth code prompts, terms of service agreements, and final status.
- [x] Task 2: Add REST API endpoints in `server/server.py` (`/api/auth/status`, `/api/auth/start`, `/api/auth/input`, `/api/auth/accept_terms`, and `/api/auth/logout`).
- [x] Task 3: Build the Accessible Auth Modal / Wizard in `server/web/index.html` with full ARIA semantics, live announcements (`aria-live="polite"`), clean text input for code pasting, and distinct buttons for Terms of Service acceptance.
- [x] Task 4: Add Auth Status badge and Login/Logout action in the Companion Web UI top navigation / settings drawer.
- [x] Task 5: Sync updated server and web assets to APK assets (`app/src/main/assets/server/`).
- [x] Task 6: Verify AST integrity, human-grade craftsmanship, and zero-violation lint via `validate_code.py`.
- [x] Task 7: Diagnose and resolve BUG-AUTH-TIMEZONE-FLAG-004 (UTC timezone skew in token expiry, invalid `-i` flag in PTY spawn, premature token deletion, and anchor tag link protection).
- [x] Task 8: Add BROWSER=true defensive flag in server background CLI calls to eliminate unexpected browser popups while on the Android home screen.
- [x] Task 9: Live server deployment and verification: verified `/api/auth/status` correctly recognizes active `ahanafy545@gmail.com` token (`is_valid: true`, `logged_in: true`).

## Phase 12: توثيق ومصادقة بروتوكولات سياق النموذج (MCP Authentication & Token Pairing / Device Flow & Bearer Token) (Ready for Execution 🚀)
- [ ] Task 1: دوال معالجة البروتوكول ومصادقة الأجهزة وفحص نبض الحياة (JSON-RPC initialize & ping) في `server/server.py`.
- [ ] Task 2: نقاط النهاية REST API في `server/server.py` (`/api/mcp/auth/request_device`, `/api/mcp/auth/pair`, `/api/mcp/auth/test`) مع الحفظ الذري للتوكنات في `~/.gemini/config/mcp_config.json`.
- [ ] Task 3: بناء نافذة الحوار المخصصة للوصولية `<dialog id="mcp-auth-dialog">` في `server/web/index.html` بدعم مسار رمز التحقق والربط (Device Flow) ومسار التوكن المباشر (Bearer / API Key).
- [ ] Task 4: إضافة أزرار "🔐 توثيق / ربط" إلى بطاقات البروتوكولات المثبتة وبطاقات الكتالوج المعتمد.
- [ ] Task 5: مزامنة التعديلات إلى أصول حزمة الأندرويد (`app/src/main/assets/server/`) ومجلد السيرفر النشط (`~/.antigravity-server/`).
- [ ] Task 6: التحقق الآلي الصارم وخلو الأخطاء عبر `validate_code.py` واختبار الاتصال الحقيقي.

## Phase 13: Standalone Custom AI Agent & Flash-Lite Multi-Provider Integration (REQ-012)
- [x] Task 1: Built `server/custom_agent.py` supporting Google Gemini Flash-Lite native API, tool calling (bash, read_file, write_file), and OpenAI-compatible custom providers (Groq, OpenRouter, Together, local Ollama).
- [x] Task 2: Integrated custom agent engine routing into `server/server.py` with endpoints `/api/custom-agent/config` and `/api/custom-agent/models`.
- [x] Task 3: Upgraded `server/web/index.html` with dual-engine switching (Antigravity vs. Custom Agent), Flash-Lite model selector, API key persistence, and custom provider manager.
- [x] Task 4: Verified end-to-end live execution in Termux with Google Flash-Lite models and interactive tool execution.
- [x] Task 5: Synchronized all updated server and web assets to Android APK assets (`app/src/main/assets/server/` and `app/src/main/assets/web/`).
- [x] Task 6: Passed strict AST validation and senior human-grade craftsmanship checks with 0 violations.

## Phase 14: Human-Grade UI Label Conciseness & Screen Reader Optimization (REQ-012)
- [x] Task 1: مراجعة واستخراج كافة النصوص والتسميات الطويلة أو المكتوبة بأسلوب آلي مفرط (Robotic AI Fluff) في `server/web/index.html`.
- [x] Task 2: إعادة صياغة التسميات ومساعدات القراءة (Helper texts & ARIA labels) بأسلوب بشري، مباشر، وموجز يقلل الإرهاق السمعي لمستخدمي TalkBack و Jieshuo.
- [x] Task 3: مزامنة التعديلات إلى مجلد أصول تطبيق الأندرويد (`app/src/main/assets/web/`) والسيرفر النشط (`~/.antigravity-server/web/`).
- [x] Task 4: التحقق الآلي الصارم عبر `validate_code.py` والتأكد من سلامة الواجهة بنسبة 100%.

## Phase 15: Accessible Focus & Keyboard Navigation for Slash (/) and Mention (@) Menus (REQ-013)
- [x] Task 1: فحص دورة حياة ومكونات قائمة الأوامر `/` وقائمة السياق `@` في `server/web/index.html`.
- [x] Task 2: تطبيق إدارة التركيز الحية وإتاحة التنقل الكامل بالأسهم والسحب مع تنبيهات `aria-live` و `aria-activedescendant`.
- [x] Task 3: دعم الاختيار بـ Enter والإلغاء بـ Escape/Back مع إعادة التركيز بدقة لحقل الإدخال.
- [x] Task 4: مزامنة التعديلات إلى مجلد أصول تطبيق الأندرويد والسيرفر النشط.
- [x] Task 5: التحقق العملي والاختبار الآلي بنسبة 100% لضمان عدم الاعتماد على التلمس اليدوي.

## Phase 16: Multi-Trigger Support for Slash Commands (/) and Mentions (@) within Single Prompt (REQ-014)
- [x] Task 1: فحص منطق رصد الكلمات المفتاحية (`handleInput` / Caret Position Regex) في `server/web/index.html`.
- [x] Task 2: معالجة قيد الفتح لمرة واحدة وتمكين انبثاق القائمة عند كتابة `/` أو `@` في أي موضع بالرسالة مسبوقاً بمسافة.
- [x] Task 3: دعم إدراج وسحب أكثر من أمر أو مهارة متتالية داخل نفس الحقل مع الحفاظ على سلامة النص السابق.
- [x] Task 4: مزامنة التحديثات واختبار استدعاء متعدد للأوامر والمهارات بنجاح.

## Phase 17: Model-Adaptive Reasoning Effort Filtering & Guard for Claude Models (REQ-015)
- [x] Task 1: فحص منطق بناء أوامر CLI (`PersistentAISessionManager.start_session`) في `server/server.py`.
- [x] Task 2: إضافة مصفوفة تحقق دفاعية (Model Capabilities Whitelist) للنماذج الداعمة لخاصية `--effort`، وتجريد الراية تلقائياً عند تشغيل نماذج Claude أو أي نموذج غير داعم.
- [x] Task 3: تحديث `server/web/index.html` لتعطيل قائمة الـ effort أو إخفائها مع تقديم إشعار صوتي لمستخدم TalkBack/Jieshuo بأن التفكير غير مدعوم لهذا النموذج.
- [x] Task 4: مزامنة التعديلات واختبار تشغيل نموذج `claude-sonnet-4-6` والتأكد من انطلاق الجلسة بنجاح دون أي خطأ.

## Phase 18: Permanent Release Keystore & In-Place Seamless APK Update Pipeline (REQ-016)
- [x] Task 1: توليد مفتاح توقيع دائم (`antigravity-release-key.jks`) بمعايير أمان موثوقة (RSA 4096 / SHA-256).
- [x] Task 2: تكوين خيارات التوقيع الدائم (`signingConfigs.release`) داخل `app/build.gradle`.
- [x] Task 3: تحديث مسار عمل البناء السحابي `.github/workflows/build-apk.yml` لاستخدام مفتاح التوقيع الدائم عند بناء وتوقيع حزم الـ Release APK.
- [x] Task 4: التحقق العملي من إمكانية تثبيت تحديث جديد فوق الإصدار القديم مباشرة (In-Place Update) بدون طلب إلغاء التثبيت.
