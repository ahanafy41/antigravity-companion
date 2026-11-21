# لوحة الكانفاس التفاعلية ومستودع "التطبيقات" - خطة التنفيذ البرمجية المعتمدة (EGM Resolved)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview

تنفيذ ميزة **لوحة الكانفاس التفاعلية (Accessible Live Canvas)** ومستودع **"التطبيقات"** في تطبيق الرفيق (Antigravity Companion)، لتمكين الوكيل من إنشاء تطبيقات مصغرة، وتشغيلها واختبارها حياً داخل نفس الصفحة بدون إطارات iframes معقدة لحماية قارئ الشاشة (TalkBack / Jieshuo)، مع تطبيق كافة التحسينات المعمارية الناتجة عن مراجعة سمك الزينة (حماية المؤقتات، مؤشر التركيز البديل، وفهرسة التخزين O(1)).

---

## Architecture & Proposed Changes

```text
.antigravity-companion-repo/
├── server/
│   ├── apps_service.py              # NEW: إدارة التخزين، الفهرس المركزي index.json، والكتابة الذرية
│   ├── application.py               # EDIT: تسجيل مسارات /api/apps (GET, POST, DELETE) وحماية CSRF
│   └── web/
│       ├── canvas-runner.js         # NEW: محرك الكانفاس، عزل التنسيقات، تنظيف المؤقتات، والناطق الصوتي
│       ├── apps-manager.js          # NEW: إدارة مستودع التطبيقات، التصيير الميسر، وتحديث العداد
│       ├── index.html               # EDIT: زر "التطبيقات" بالدرج، ونافذتي apps-dialog و canvas-runner-dialog
│       ├── main-ui.css              # EDIT: تنسيقات عالية التباين وأبعاد اللمس (48x48dp)
│       ├── native-drawer.js         # EDIT: ربط زر "التطبيقات" بالدرج مع العداد
│       ├── artifacts-viewer.js      # EDIT: إضافة زر [⚡ تشغيل في الكانفاس] وجسر "تعديل في الشات"
│       ├── run_apps_api_tests.cjs   # NEW: اختبارات REST API لخدمة التطبيقات
│       ├── run_canvas_runner_tests.cjs # NEW: اختبارات وحدة لمحرك الكانفاس والتركيز والناطق
│       └── run_canvas_integration_tests.cjs # NEW: اختبارات التكامل الشاملة لدورة الحياة
└── docs/
    ├── design/accessible_canvas_and_apps_hub.md # APPROVED EGM DESIGN DOC
    └── plans/2026-11-20-accessible-canvas-and-apps-hub.md # THIS PLAN
```

---

## Tasks & Execution Phases

### Phase 1: Storage Layer & Backend REST Service (`apps_service.py` & `application.py`)

- [ ] **Step 1: كتابة اختبار فاشل لواجهات برمجة التطبيقات**
  - إنشاء ملف `server/web/run_apps_api_tests.cjs` لاختبار:
    - جلب قائمة التطبيقات فارغة `{"apps": []}`.
    - التحقق من رفض Path Traversal (مثل `../../bad_id`).
    - إنشاء تطبيق وحفظه ذرياً في `${DATA_DIR}/apps/index.json`.
    - جلب التطبيق المنشأ والتأكد من تطابق البيانات.
    - حذف التطبيق وتحديث الفهرس المركزي.
  - تشغيل الاختبار والتأكد من فشله (`404 Not Found`).

- [ ] **Step 2: إنشاء وحدة `server/apps_service.py`**
  - إنشاء مجلد `apps/` داخل مسار البيانات `${DATA_DIR}`.
  - دوال: `list_apps(data_dir)` تعتمد قراءة `index.json` بـ $O(1)$.
  - دالة `save_app(data_dir, app_dict)` تدعم الكتابة الذرية via temporary file + `os.replace`.
  - دالة `delete_app(data_dir, app_id)` وتحديث الفهرس.
  - التحقق الصارم من المعرّف `^[a-zA-Z0-9_-]{1,64}$` والتأكد من المسار عبر `os.path.commonpath`.

- [ ] **Step 3: تسجيل المسارات في `server/application.py`**
  - إضافة مسارات:
    - `GET /api/apps`
    - `GET /api/apps/{app_id}`
    - `POST /api/apps` (مع فحص CSRF وحد أقصى لحجم الكود 500KB)
    - `DELETE /api/apps/{app_id}` (مع فحص CSRF)

- [ ] **Step 4: التحقق من نجاح الاختبارات الآلية**
  - تشغيل `node server/web/run_apps_api_tests.cjs` والتأكد من نجاح كافة المسارات بنسبة 100%.

- [ ] **Step 5: حفظ التغييرات بـ Git Commit**
  - رسالة الكوميت: `feat(api): implement persistent apps storage with central indexing and CSRF`

---

### Phase 2: Accessible Canvas Runner Engine (`server/web/canvas-runner.js`)

- [ ] **Step 1: كتابة اختبار وحدة لمحرك الكانفاس**
  - إنشاء `server/web/run_canvas_runner_tests.cjs`.
  - اختبار تثبيت الكود، استبدال CSS عبر `transformAppStyles`، تنظيف المؤقتات المسجلة عند الإغلاق، الناطق الصوتي مع التهدئة (throttling 250ms)، واستعادة التركيز البديل.

- [ ] **Step 2: تطوير وحدة `canvas-runner.js`**
  - كائن UMD مع دورة حياة: `launch(appData)`, `teardown()`, `reset()`.
  - دالة `transformAppStyles(css, '#canvas-mount-point')` لعزل الأنماط.
  - تتبع وحذف المؤقتات (`setTimeout`, `setInterval`) عبر Set ومسحها بالكامل عند unmount.
  - حقن `window.CompanionApp` مع دعم `CompanionApp.announce(text, isAssertive)` و `CompanionApp.onDestroy(callback)`.
  - استعادة التركيز الدفاعية: فحص وجود العنصر السابق، مع الرجوع لـ `#message-input` كبديل آمن.

- [ ] **Step 3: التحقق من نجاح اختبارات محرك الكانفاس**
  - تشغيل `node server/web/run_canvas_runner_tests.cjs` والتأكد من اجتياز كافة الاختبارات.

- [ ] **Step 4: حفظ التغييرات بـ Git Commit**
  - رسالة الكوميت: `feat(canvas): implement accessible live canvas runner with resource lifecycle teardown`

---

### Phase 3: Apps Hub UI & Navigation Drawer Integration (`apps-manager.js`, `index.html`, `native-drawer.js`)

- [ ] **Step 1: تعديل `server/web/index.html` و `server/web/main-ui.css`**
  - إضافة زر `btn-open-apps` في القائمة الجانبية:
    ```html
    <button type="button" id="btn-open-apps" class="drawer-btn" aria-label="التطبيقات">
      <span>التطبيقات</span>
      <span id="val-apps-count-drawer" class="badge-count">0</span>
    </button>
    ```
  - إضافة نافذة `apps-dialog` لعرض قائمة التطبيقات المحفوظة بأزرار 48x48dp.
  - إضافة نافذة `canvas-runner-dialog` لحاوية التشغيل وأزرار شريط التحكم.
  - إضافة تنسيقات التباين العالي وأبعاد اللمس لـ WCAG 2.5.5 في `main-ui.css`.

- [ ] **Step 2: تطوير وحدة `apps-manager.js`**
  - إدارة قائمة التطبيقات المعروضة والصفحات (10 تطبيقات في الصفحة).
  - تحديث عداد التطبيقات في القائمة الجانبية (`#val-apps-count-drawer`).
  - دعم حذف التطبيق مع تأكيد صوتي وإعادة التركيز.

- [ ] **Step 3: تحديث `server/web/native-drawer.js`**
  - ربط زر `btn-open-apps` بفتح `apps-dialog` ومزامنة العداد.

- [ ] **Step 4: تشغيل الاختبارات وحفظ الكوميت**
  - رسالة الكوميت: `feat(apps): implement apps hub manager, UI dialogs, and drawer integration`

---

### Phase 4: Chat & Artifact Integration (`artifacts-viewer.js`)

- [ ] **Step 1: تحديث `server/web/artifacts-viewer.js`**
  - إضافة زر `[⚡ تشغيل في الكانفاس]` في عارض الأرتيفاكتس وكروت المحادثة.
  - ربط زر `[🛠️ تعديل التطبيق في الشات]` في الكانفاس بإغلاق النافذة ووضع البادئة `@تعديل_تطبيق: [اسم التطبيق] (ID: [app_id])` في `#message-input`.
  - ربط زر `[💾 حفظ في التطبيقات]` بطلب الحفظ عبر `AppsManager`.

- [ ] **Step 2: كتابة اختبار التكامل الشامل**
  - إنشاء `server/web/run_canvas_integration_tests.cjs` وفحص دورة الحياة الكاملة.

- [ ] **Step 3: حفظ الكوميت**
  - رسالة الكوميت: `feat(integration): integrate artifact runner and chat edit bridge`

---

### Phase 5: Production Deployment & Live Verification

- [ ] **Step 1: تشغيل كافة اختبارات النظام للتأكد من عدم وجود أي انحدار (Regression)**
  - تشغيل `node server/web/run_tests.cjs`.
  - تشغيل كافة اختبارات الكانفاس الجديدة.
- [ ] **Step 2: مزامنة الكود مع خادم الرفيق النشط (`~/.antigravity-server/`)**
  - نسخ الملفات وتحديث الخادم بدون التأثير على الجلسات الجارية.
- [ ] **Step 3: بناء تطبيق تفاعلي حي وتجربته مع المستخدم**
  - إنشاء تطبيق "حاسبة زكاة المال الصوتية" وتشغيله في الكانفاس وتجربة الحفظ في "التطبيقات".
