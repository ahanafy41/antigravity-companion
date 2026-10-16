# وثيقة التوجيه الهندسي والمواصفات المعمارية: التحول إلى الرفيق الخفيف وإلغاء خدمة الوصول
## RFC: Transition to Lean Companion Architecture (Purge of Accessibility Service)
**المشروع:** `ahanafy41/antigravity-companion`  
**المرجع:** PR #1 (`codex/refactor-phase-1`)  
**الجهة:** المطور الأساسي والمالك (أحمد - @ahanafy41)  
**تاريخ الإصدار:** أكتوبر 2026  
**المعيار المتبع:** `universal-software-agency` (Zero-Hallucination & Surgical Execution)

---

## 1. الخلفية والقرار المعماري الاستراتيجي (Executive Architectural Decision)

بناءً على التجربة الميدانية واستخدام التطبيق مع قارئات الشاشة (TalkBack و Jieshuo / CSR)، تبيّن أن:
1. **بطء الأتمتة البصرية**: الأتمتة النيابية عبر شجرة الوصول (Accessibility Tree Dump) تستغرق دورات فحص وتحليل بطيئة (LLM Latency) تسبب إحباطاً للمستخدمين مقارنة بالسرعة الفورية.
2. **التأثير السلبي على قارئات الشاشة والبطارية**: تشغيل خدمة إمكانية وصول ثانية (`typeAllMask`) في أندرويد يستهلك موارد المعالج ويسبب ثقلاً وتأخيراً في استجابة قارئ الشاشة الأساسي.
3. **وجود البديل الأسرع والأفضل**: كافة وظائف التحكم (تشغيل يوتيوب، التصفح، تشغيل السكريبتات، البحث، المراسلة) تُنفّذ عبر تيرمكس مباشرة (`termux-open-url`, `ai-browser`, Python CLI) بسرعة فائقة (أقل من 100ms) ودون أدنى حاجة لخدمة إمكانية الوصول.

**القرار النهائي للمالك:**
> **إلغاء خدمة إمكانية الوصول (`AntigravityAccessibilityService`) وسيرفر الأتمتة المحلي (`LocalAutomationServer` على المنفذ 8765) بالكامل من التطبيق، وتبسيط شاشة البداية لتعتمد حصرياً على خادم تيرمكس للشات (المنفذ 7681).**

---

## 2. جدول إبادة الملفات المهجورة (Files To Be Deleted Completely)

يُطلب من كمال و Codex حذف الملفات التالية نهائياً من المستودع لتخليص التطبيق من التعقيد:

### أ) ملفات كود الأندرويد (Java Source Files - 17 ملف):
1. `app/src/main/java/com/antigravity/companion/AntigravityAccessibilityService.java`
2. `app/src/main/java/com/antigravity/companion/LocalAutomationServer.java`
3. `app/src/main/java/com/antigravity/companion/ScreenSnapshot.java`
4. `app/src/main/java/com/antigravity/companion/ElementClick.java`
5. `app/src/main/java/com/antigravity/companion/DeviceActionPolicy.java`
6. `app/src/main/java/com/antigravity/companion/DeviceArguments.java`
7. `app/src/main/java/com/antigravity/companion/AppLaunchTarget.java`
8. `app/src/main/java/com/antigravity/companion/FloatingVoiceController.java`
9. `app/src/main/java/com/antigravity/companion/NativeSpeech.java`
10. `app/src/main/java/com/antigravity/companion/PendingSpeech.java`
11. `app/src/main/java/com/antigravity/companion/SpeechRequest.java`
12. `app/src/main/java/com/antigravity/companion/AutomationConnectionPolicy.java`
13. `app/src/main/java/com/antigravity/companion/PhoneResultBudget.java`
14. `app/src/main/java/com/antigravity/companion/HeadlessVoiceApi.java`
15. `app/src/main/java/com/antigravity/companion/HeadlessVoiceCommand.java`
16. `app/src/main/java/com/antigravity/companion/VoiceCapture.java`
17. `app/src/main/java/com/antigravity/companion/VoiceCommandActivity.java`

### ب) ملفات الموارد (XML Resources - 1 ملف):
18. `app/src/main/res/xml/accessibility_service_config.xml`

### ج) ملفات الاختبارات القديمة المقابلة (JVM Unit Tests - 10 ملفات):
19. `app/src/test/java/com/antigravity/companion/AutomationConnectionPolicyTest.java`
20. `app/src/test/java/com/antigravity/companion/DeviceActionPolicyTest.java`
21. `app/src/test/java/com/antigravity/companion/DeviceArgumentsTest.java`
22. `app/src/test/java/com/antigravity/companion/ElementClickTest.java`
23. `app/src/test/java/com/antigravity/companion/PhoneResultBudgetTest.java`
24. `app/src/test/java/com/antigravity/companion/SpeechActionPolicyTest.java`
25. `app/src/test/java/com/antigravity/companion/SpeechRequestTest.java`
26. `app/src/test/java/com/antigravity/companion/AppLaunchTargetTest.java`
27. `app/src/test/java/com/antigravity/companion/HeadlessVoiceCommandTest.java`
28. `app/src/test/java/com/antigravity/companion/LegacyVoiceApiTest.java`

---

## 3. التعديلات الجراحية في الأكواد المتبقية (Surgical Modifications)

### 1) ملف البيان `app/src/main/AndroidManifest.xml`:
- حذف كتلة تعريف الخدمة بالكامل: `<service android:name=".AntigravityAccessibilityService" ... />`.
- حذف تعريف نشاط الصوت: `<activity android:name=".VoiceCommandActivity" ... />`.
- حذف أي صلاحيات زائدة مرتبطة بالنوافذ العائمة مثل `SYSTEM_ALERT_WINDOW`.

### 2) كود `app/src/main/java/com/antigravity/companion/MainActivity.java`:
- حذف عنصر `accessibilityBanner` من الواجهة.
- تنظيف كائن حالة الاتصال `getConnectionStatus()`:
  - إزالة خاصيتي `automation_ready` و `accessibility_active`.
  - الإبقاء فقط على: `server_available: boolean`، `version: String`، `can_install: boolean`.
- حذف الإجراءات المقيدة المحذوفة في `Companion.native` (مثل أفعال الشاشة والصوت).

### 3) محرك التشخيص `app/src/main/java/com/antigravity/companion/DoctorDiagnosticEngine.java`:
- إزالة فحص `accessibility_connected`.
- يقتصر الفحص على 3 نقاط جوهرية فقط:
  1. `termux_installed` (تثبيت تطبيق Termux).
  2. `termux_run_command_permission` (صلاحية RUN_COMMAND).
  3. فحص اتصال خادم تيرمكس المحلي (Port 7681).

### 4) سياسات الجسر `NativeBridgePolicy.java` و `NativeActionArguments.java`:
- تنظيف مصفوفة الأفعال المسموحة وحذف أسماء الدوال التي تم إلغاؤها.

---

## 4. إعادة هندسة شاشة البداية (`server/web/start.html` و `start-ui.js`)

تتحول الشاشة إلى واجهة رشيقة، واضحة ومباشرة لقارئات الشاشة (Screen-Reader-First):

### أ) المحتوى البصري والصوتي في `start.html`:
1. **الترويسة (Header)**:
   - العنوان: `Antigravity Companion` (بدون نصوص فرعية دعائية).
2. **شريط الحالة الموحد (Single Status Line)**:
   - حالة واحدة فقط لخادم تيرمكس:
     - إذا كان متصلاً: `"خادم تيرمكس: نشط ومتصل"` (أخضر).
     - إذا كان متوقفاً: `"خادم تيرمكس: متوقف"` (أحمر).
   - إزالة أي إشارة للمنفذ 8765 أو خدمة إمكانية الوصول.
3. **مجموعة الأزرار الأساسية (Core Actions)**:
   - **[ دخول الشات والمحادثة ]** (`#btn-go-chat`) - الزر الأساسي البارز.
   - **زر موحد ذكي للخادم (Toggle Server Button)**:
     - عند توقف السيرفر: الزر يعرض **[ تشغيل الخادم ]** (`#btn-wake-server`).
     - عند تشغيل السيرفر: الزر يتحول إلى **[ إيقاف الخادم ]** (`#btn-stop-server`).
   - **[ فحص وإصلاح الأعطال ]** (`#btn-run-diag`).
   - **[ فحص التحديثات ]** (`#btn-check-update`).
4. **قسم الإعداد الأولي والصيانة (تحت عنوان منفصل)**:
   - **[ تجهيز Termux لأول مرة ]** (`#btn-setup-termux`).

### ب) المنطق البرمجي في `start-ui.js`:
- إزالة دوال فحص الـ WebSocket والبورت 8765.
- تبسيط `checkStatus()` لتفحص فقط جاهزية خادم تيرمكس (7681) وحالة تثبيت Termux.
- توحيد زر تشغيل/إيقاف الخادم ليعكس الحالة ديناميكياً.
- عند تشغيل التشخيص (`Doctor`)، إعلان النتيجة صوتياً عبر `#live-announcer` بعبارات عربية واضحة ومباشرة بدلاً من تفريغ JSON خام على الشاشة.

### ج) مزامنة الملفات (Mirroring Invariant):
- مزامنة كافة تعديلات `server/web/` حرفياً مع `app/src/main/assets/web/`.

---

## 5. مصفوفة التحقق وفحوصات الجودة (Quality Gate & Testing)

يجب أن تمر التغييرات بالفحوصات الصارمة التالية بنجاح 100%:
1. **JVM Tests**: تشغيل `./gradlew testDebugUnitTest` بنجاح كامل لجميع الاختبارات المتبقية دون أي أخطاء.
2. **Android Lint**: تشغيل `./gradlew lintDebug` (0 errors).
3. **Python Tests**: نجاح كافة اختبارات السيرفر (202 اختبار بايثون).
4. **Web Syntax Check**: خلو ملفات الـ JS المعدلة من أي أخطاء عبر `node --check`.
5. **APK Build**: بناء حزمة الـ APK للتأكد من انخفاض حجم الحزمة وسرعة إقلاع التطبيق.

---
**توقيع الاعتماد الهندسي:**  
المطور الأساسي: أحمد حنفي (@ahanafy41)  
المنسق التقني: Antigravity Universal Software Agency
