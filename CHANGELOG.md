# سجل التغيير

- 2026-10-27 — release 1.3.7 (code 13): إيقاف الخادم الموثوق بـ Watchdog و stop_server.sh، سكريبت تثبيت ذاتي متكامل setup.sh للبدء من الصفر، تعافي وتجديد آلي لـ CSRF Tokens مع منع تكرار الطلبات، تحسين سرعة البث المباشر (Streaming)، وترتيب المحادثات الحقيقي بالتاريخ الدقيق.

- 2026-10-16 — refactor: remove the orphan Termux port probe, seven unused Android resources and two retired web assets/routes; migrate dependent checks to the active interface while preserving server entry, launcher and security contracts.

- 2026-10-16 — refactor: retire native automation/voice and Java-WebSocket, reduce the dashboard to five controls and diagnostics to three checks, preserve private shutdown and settings guards, and migrate acceptance tools to the lean chat shell.

- 2026-10-16 — refactor: centralize adapter-owned settings with draft revision and race guards, preserve partial saves and accessible feedback, and remove redundant MCP listing, private native remnants and duplicate SW registration; prior validator/mentions findings remain disclosed.

- 2026-10-16 — fix: accept plugin/skill toggle id when name is absent in the API adapter and Android mirror; published in f3f5c35, with maintainer sign-off and explicit exemptions for the existing mentions selector and validator Regex false positive.

- 2026-10-15 — fix (review snapshot, known failed checks): add bounded legacy floating voice and cancellable one-shot HTTP, three SSE GET reconnects, current UI/phone harness selectors, and remove ignored CLI help/repeated availability probes; uploaded for maintainer inspection at user request; existing browser failures and missing upstream agy retry contract remain.

- 2026-10-15 — fix: restore bundled fullscreen dashboard, mirror all runtime web assets into Android/APK, accept legacy HTTP readiness without HMAC credentials, and preserve synchronous AntigravityBridge compatibility.

- 2026-10-15 — feat: adopt approved main UI over API v1 with CSP assets, headless voice, trusted loopback automation, asynchronous native controls and owned graceful shutdown; fix CLI update help preflight.

- 2026-10-14 — docs: pin maintainer main UI and plan API v1/native/CSP adaptation; frontend replacement awaits architectural approval.

- 2026-10-14 — fix: implement PR #1 CLI discovery/version parsing, dynamic workspace mentions, accessible dialogs/settings/policy controls, and automatic loopback sessions with origin and CSRF guards.


- 2026-10-14 — fix: address main comparison findings across MCP scopes, process groups, speech cancel, and auth state.

- 2026-10-08 — feat: add durable local once schedules and FIFO next-turn messages, recover dispatch safely, cancel owned work, and prevent duplicate session creation.

- 2026-10-08 — feat: restore native auth handoff, MCP/OAuth, owned task inventory, bounded voice actions/TTS, visibility feedback and version display; scheduler and live-turn steering await an explicit decision.

- 2026-10-08: fix: أصلح إلغاء ترقية APK واكتشاف منفذ الخادم المصادق، وضبط Python وصحح السجلات وجدد حزمة المصدر؛ نجحت الفحوص المحلية وبناء Debug دون هاتف أو متصفح.

- 2026-10-08: chore: جُمعت أعمال إعادة الهيكلة والإصلاح والسيرفر والويب وسجلاتها في commit محلي واحد، مع استبعاد ملفات التوقيع الخاصة والمؤقتات؛ لا push.

- 2026-10-08: chore: جُدّدت بصمة الويب ووُحّدت حال التنفيذ وأُعدّت حزمة مصدر للسيرفر والويب وجرد SHA256؛ نجح التحقق المحلي دون هاتف أو متصفح.

- 2026-10-07: docs: حُصر أصل وظائف main وعقود agy وصيغت خطة التكافؤ، مع تصحيح أحكام quota/update وإضافة أفعال الجهاز والتحكم الصوتي؛ التنفيذ ينتظر اعتماد الخطة.

- 2026-10-07: fix: أصلح تدقيق الفرع توافق ترقية APK والنقر والاختيارات وقدرات CLI وحفظ الجلسات وإلغاء شجرة Windows؛ نجحت الفحوص المحلية والبناء، وبقي قبول الهاتف وOTA الفعلي خارج النطاق.

- 2026-10-04 — إعادة هيكلة 1.3.0: مصدر واحد للخادم والويب، API محلي مقترن، عمليات وسجل محفوظان، جسر Android مقيد، وتثبيت موقع مع رجوع؛ نجح البناء والفحص المحلي، وبقي قبول الهاتف وتنظيف الأصل بعده.

- 2026-10-04 — بدء قبول الهاتف: تطابقت الشهادة وثُبّت 1.3.0 على Samsung A55 بعد مسح بيانات Companion وإغلاق Termux بإذن المستخدم؛ التجربة تنتظر إذن RUN_COMMAND.

- 2026-10-04 — fix: إصدار 1.3.2/8 يصلح LF ومفسر RUN_COMMAND وعقد exitCode الاختياري وفق مصدر Termux والشفرة القديمة؛ نجح البدء والاقتران وشجرة الوصول واللقطة على الهاتف.

- 2026-10-04: إعداد فاحص قبول هاتف حقيقي للمحادثة والإلغاء والاستئناف وأفعال Accessibility والإملاء، مع تقرير منقح وحفظ تقدم مستقل.

- 2026-10-05: إصلاح Back لإغلاق dialog في WebView الموثوق ورد التركيز؛ فاحص هاتف بحفظ تقدم ونتائج منقحة؛ 1.3.3/9 محلي دون إعادة فحص أو تثبيت على الهاتف بطلب المستخدم.

- 2026-10-05: fix: عالج 1.3.4/10 ستة عيوب كشفتها المراجعة المستقلة في precache وMCP وهوية الحزمة وروابط Markdown وتعافي NDJSON وeffort؛ دون إعادة فحوص أو استعمال الهاتف.

- 2026-10-05: feat: أكمل 1.3.5/11 احتفاظ أحداث البث مع حفظ المحادثات، وغلق جلسة CLI الساكنة دون سباق بدء، وعقد 404/405 في API v1؛ أمثلة الانحدار مكتوبة دون تشغيل.

- 2026-10-05: fix: عالج1.3.6/12 نتائج مقارنةmain في سياسةCLI وeffort والتنبيه والاقتراحات وحدودNative/الهاتف واستردادالإقلاع،وأعادقياساتالمواردوDoctorمعبيانالعقودغيرالمتاحة؛لااختباراتمعادة.

2026-10-05: ثُبّت APK1.3.6/12 وخادمه الموقّع على الهاتف مع حفظ البيانات؛ أظهر التطبيق اتصالًا مصادقًا، دون فحص تفصيلي.
