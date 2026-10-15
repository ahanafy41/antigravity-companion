# مرجع تشغيل Antigravity Companion

## feat: approved main UI and headless controls — 2026-10-15

اعتماد المطور: PR #1، التعليق 6180568312. المصدر المثبت upstream/main@05470d6. index.html وstart.html المدخلان الوحيدان النشطان في / و/start؛ main-ui/start-ui CSS/JS محلية تحت CSP القائم، وmain-v1-adapter.js يستعمل api.js/native.js/history.js دون تبديل fetch العام. لا تعد تحميل أي أصل قديم رجوعًا إلى واجهة PR؛ لا تحذف الأصول المحفوظة المشروطة بقبول الهاتف.

POST /api/v1/system/shutdown يحتاج الجلسة وCSRF، ويرد 202 stopping ثم يستدعي callback يملكه server.py مرة واحدة؛ create_app المضمّن بلا callback يرد 503. لا kill عام. VoiceCommandActivity يسلم إلى FloatingVoiceController وينتهي بلا MainActivity؛ HeadlessVoiceCommand يختار cwd المحفوظ أو أول workspace root، ويستعمل HMAC ثم Cookie/CSRF وإلغاء request_id عند الشك. النطق من NativeSpeech القائم بعد نتيجة الخلفية؛ الإملاء في المحرر المفتوح فقط.

WebSocket 127.0.0.1:8765 يثق بعنوان peer الحقيقي دون Bearer، ويرفض Origin الأجنبي وغير loopback؛ العقد WS journal_ready_epoch_v1 باقٍ. لا تفترض وجود HTTP serve أو مصدر /usr/bin/phone. الجسر async عبر CompanionNative، مع Origin والإطار الرئيس وHMAC قبل الأفعال الخاصة. get_connection_status يميز automation_ready عن server_authenticated. الترقية تستعمل الحزمة التي تحقق منها Android؛ URL من JavaScript لا يختار APK.

أذون CLI لا تحفظ في settings: whitelist/command(*) عبر /cli/policy مع revision وصون deny/ask؛ بقية الأذون غير الموصولة معطلة. OAuth GET/PATCH /mcp/{name}/oauth يحفظ المالك وrevision والفارغ يصون السر. المصادقة إحالة إلى agy، بلا ادعاء authenticated. SSE يحفظ cursor ويعيد GET مرة، ثم snapshot؛ لا يعيد POST مجهولًا. الرسالة الجارية queued للدور التالي، ومعرّفها ومعرّف ترقية CLI يبقيان عند غموض النتيجة. ظهور الوظيفة لا يثبت قبول الهاتف أو حساب agy.

الفحص المستهدف: scripts/run_shutdown_tests.py وserver/web/run_main_ui_tests.cjs مع فحوص Python/JVM القائمة؛ Debug يعبئ المصدر من server/. تقرير الحصيلة: docs/ui-main-adaptation-report.md. لا نشر Release أو تثبيت هاتف ضمن هذا الطلب؛ رفع فرع PR والرد على المطور مأذونان صراحةً.

## مطالب صاحب PR #1 — 2026-10-14

أذن المستخدم بتنفيذ التعليقات جميعًا؛ التعقيب الأخير ينسخ اشتراط كود المتصفح. GET /api/v1/auth/session يصدر جلسة محلية تلقائية بلا PIN، ويحفظ HttpOnly وSameSite=Strict وCache-Control:no-store؛ الحراسة تفحص peer loopback وHost الدقيق وOrigin المطابق وSec-Fetch-Site، وتبقي CSRF للتغيير وHMAC/Bearer لمسار Android bootstrap. الثقة تشمل العملاء المحليين؛ لا يُدّعى أن Origin يثبت هويتهم. /pair القديم باقٍ للتوافق فقط، بلا حقل رمز أو طبع رمز في التشغيل.

CLI يستعمل plugin list --json مع حفظ metadata وقبول []، و--version؛ النماذج تقبل TAB والمسافات وspinner المثبت. مصادر / تُكتشف من TOML والمهارات المفعلة ومكونات الإضافات المعلنة، دون قائمة أوامر أساسية ثابتة. اقتراح @ يستعمل /files وفق cwd الفعلي مع حراسة الرد القديم؛ المسارات ذات الفراغات تحفظ مقتبسة في المسودة، وقبولها في agy الحقيقي يحتاج إثباتًا منفصلًا. الإعدادات تحفظ الحقول المعدلة وحدها؛ الأذون حقول قواعد معنونة مع allow/deny/ask؛ ملفات MCP وOAuth المركبة تبقى وفق عقدها.

فحوص الإضافة: scripts/run_pairing_tests.py وscripts/run_settings_panel_tests.py وserver/web/run_mentions_tests.cjs؛ الفحص المتصفحي القائم run_ui_tests.cjs يشمل الدخول الآلي. مرجع الحصيلة [تقرير PR](docs/pr-1-maintainer-report.md). أذن المستخدم لاحقًا بالرفع إلى فرع PR #1؛ الإصلاحات منشورة في d017f88 ومثبتة برأس الطلب البعيد. لا تثبيت هاتف أو إصدار إنتاج أو merge.

## وظائف الخطة 2026-10-08

مرجع الحال [حصيلة الوظائف](docs/feature-completion-report.md). API/v1 يضيف /auth/login و/auth/{id}/cancel، /mcp/{name}/test و/authenticate وGET/PATCH /oauth، /tasks وإلغاء run المملوك، /voice/runs وقراءة/إلغاء run، /voice/requests/{request_id}/cancel، /client/visibility و/system/versions. تبقى حراسة الاقتران وCSRF؛ OAuth لا يعرض السرّ، والحقل الفارغ يحفظه، clear_client_secret يمحوه صراحة، وrevision يحرس التعارض. ملفات MCP ونسخها المؤقتة محجوبة عن file API. native login_cli/mcp_cli يستعملان أمر agy ثابتًا مع cwd موثوق وAGY_CLI_DISABLE_AUTO_UPDATE=true؛ authenticated مجهول حتى دليل مستقل، وإلغاء handoff لا يقتل terminal المستخدم.

voice planner يعمل في .tmp/voice-planner تحت جذر الحفظ، مع agent ثابت بلا أدوات ولا MCP ولا skills ولا plugins؛ prompt يرسل قبل init، ولا تقبل النتيجة قبل إثبات init.tools فارغًا. خمس دورات JSON محصورة، ومنع أثر مكرر بعد restart أو cancel. أفعال speak/speech_cancel عبر سجل Android وHMAC؛ speak ينتظر onDone، والإلغاء المقيد يأخذ utterance_id. أوضاع agent وdictation مستقلة. اعتمد المستخدم البديل المحلي: /local-tasks GET/POST وGET /{task_id} وPOST /{task_id}/cancel. payload mode queued/scheduled، session_id، message، request_id؛ scheduled يضيف scheduled_at ISO ذا offset وmissed_policy skip/run_once. موعد واحد؛ منطقة UTC معلنة في الويب. local-tasks.json محفوظ في جذر AtomicStore الخاص؛ حدود 256 سجلًا و64 منتظرًا لكل جلسة. العامل كل ثانية أثناء حياة السيرفر، ويحفظ occurrence قبل Sessions.start، ويستعيد المعلوم وحده؛ المجهول interrupted دون replay. الفوات عند الإنشاء أو إعادة التشغيل؛ ازدحام الجلسة يبقي pending. الإرسال المباشر لا يتجاوز queued، والإلغاء المملوك عبر TaskRuntime. توقف العامل يسبق Sessions.close. فحص run_schedule_tests.py جزء الفحص المحلي. فحوص الشفرة: run_auth_tests.py وrun_task_tests.py وrun_voice_tests.py وrun_planner_tests.py وrun_feature_tests.py، وفحص Node run_features_tests.cjs دون متصفح. قبول agy الحقيقي والحساب والهاتف منفصل.

## إصلاح نتائج المراجعة 2026-10-08

[الحصيلة](docs/review-fixes-report.md): 79 فحص Python و35 JVM وNode وبناء Debug ناجحة؛ Black79 وflake8 نظيفان؛ Lint بلا أخطاء وله 24 ملحوظة سابقة. الإلغاء يخص كل تنزيل ويُراعى قبل التحقق وبعده وقبل تسليم APK وفتح المثبت. launcher يطبع COMPANION_SERVER_PORT بعد نجاح التشغيل فقط؛ Termux يقبل علامة رقمية واحدة محدودة، والتطبيق يثبت HMAC قبل حفظ المنفذ وتقييد الأصل والجسر به. لا تعديل لمنفذ settings.json، ولا نقل stdout الخام إلى الويب. launcher القديم بلا علامة يبقى على المنفذ المحفوظ. الهاتف والمتصفح مستبعدان؛ لا تكافؤ كامل أو إصدار إنتاج جديد مستنتج من هذا الفحص.

## تسليم المصدر 2026-10-08

حزمة السيرفر والويب وجرد SHA256 تحت deliverables/server-web-2026-10-08؛ هذه نسخة مصدر، وليست حزمة ترقية موقعة أو تثبيتًا جديدًا. الحصيلة docs/server-web-delivery.md. جُدّدت بصمة SW ونجح 77 فحص Python وفحص الويب الأساسي وصياغة JavaScript. الهاتف والمتصفح مستبعدان بأمر المستخدم؛ استرداد التكافؤ غير مكتمل. قبل أي إصدار إنتاج جديد يلزم رقم فريد متوافق مع APK وتوقيع وفق العقد القائم، دون استبدال الإصدار المحلي السابق.

## خطة التكافؤ 2026-10-07

اختار المستخدم استرداد وظائف main؛ راجع [المعيار](docs/feature-parity-spec.md) و[الخطة](docs/feature-restoration-plan.md) قبل التنفيذ. البحث والخطة مكتملان ومعتمدان؛ التنفيذ جارٍ وفق task.md. أحكام التعذر القديمة ليست دليلًا على غياب العقد: update معلن وquota لها print مستقل وpermissions لها ملف رسمي. لا backend مستقل للمزودين مثبت فيmain؛ أفعال الجهاز والوكيل الصوتي/TTS وظائف أصلية. لا تغلق التكافؤ بوجود زر أورسالة تعذر أوحالة نجاح مفترضة. مصدر الإثبات وحدوده في [الأصل](docs/main-feature-baseline.md) و[العقود](docs/feature-restoration-contracts.md).

## إصلاح تدقيق الفرع 2026-10-07

الفحوص المحلية مأذونة في الطلب الجديد بعد منعها في الجلسة السابقة؛ لا هاتف أو نشر. docs/branch-audit-fix-report.md مرجع الحصيلة الحالية. health يعلن device_protocol=journal_ready_epoch_v1. كل فتح لمثبت APK يتحقق من الشهادة ونسخة server/version.json المضمّنة ثم من HMAC وتوافق الخادم الجديد؛ يلزم تثبيت حزمة الخادم الموقعة وإعادة تشغيله صراحة قبل فتح مثبت APK غير المتوافق، ولا تثبيت خادم تلقائيًا.

sessions.json وruns.json يبقيان بصيغتهما وحقولهما المجهولة. session-transaction.json سجل معاملة مؤقت قبل الكتابتين؛ لا يُحذف قبل نجاحهما، ويعاد تطبيقه عند الإقلاع ثم يُحذف هو و.bak. لا تشغيل تلقائي لدور مفقود أو أخفق حفظه؛ يعرض interrupted مع سبب صريح. حفظ النتيجة يسبق أحداث الخطأ، والاستعادة الصريحة سبيل قراءة النتيجة إن انقطع البث. إلغاء Windows يستعمل taskkill على PID المملوك مع /T /F، ولا يقبل خروجًا غير صفري ولو انتهى الأب.

المستخدم أذن بإعادة الهيكلة الشاملة على `codex/refactor-phase-1`. لا commit أو push أو نشر في هذا الطلب. مرجع المراحل [الخطة](docs/refactor-plan.md)، ومرجع الحال [project_state.md](project_state.md).

## قبل التغيير

اقرأ الوثيقة الخاصة بالمهمة وtask.md؛ لا تستكشف ملفات لا تلزمها. كل شفرة إنتاج جديدة أو معدلة تمر clean-code-guard، والفحوص test-guard، ثم verification-before-completion. احفظ الإعدادات والحقول المجهولة والاعتمادات والشهادة؛ لا raw CLI diagnostics ولا رموز الحساب أوenv/headers أو المفتاح الخاص في المخرجات.

## مصدر الإنتاج

server/ المصدر الوحيد لـPython والويب. Gradle يولد assets من هذا المصدر ومن repair.html؛ نسخ assets/server وassets/web القديمة مستبعدة من البناء وباقية حتى قبول الهاتف. server/version.json مرجع الاسم والرقم؛ لا تتغير هوية release. كل إصدار APK للترقية يحتاج version_code أعلى وشهادة التوقيع الأصلية؛ debug له لاحقة منفصلة وشهادة تطوير.

## التشغيل

server/server.py يتيح --help و--host (127.0.0.1 فقط) و--port و--data-dir و--android-token-stdin. عند غياب --port تؤخذ port من settings.json أو7681. الأصل المحلي ~/.antigravity-server افتراضي قابل للتغيير. لا قتل عام لعمليات Python، ولا SIGSTOP، ولا dangerously-skip-permissions.

API /api/v1 مع الجلسة المحلية التلقائية وHttpOnly وCSRF؛ health ليس إثبات تسجيل دخول. فحوص الهوية وأصول WebView مقيدة بالمنفذ نفسه. ملكية الجلسة وقراءة CLI واحدة، والنتيجة المكتملة حدث result معلوم؛ EOF أو نتيجة مجهولة إخفاق. لا إعادة تلقائية لدور أو فعل هاتف مجهول. MCP يغيره agy وحده عبر CLI المثبت بالمساعدة؛ فشل القائمة لا يتحول إلى بيانات مختلقة.

Android token ينقل في STDIN لأمر Termux ثابت ويُحفظ محلياً بملف خاص. لا يرسل Bearer إلى خادم قبل challenge HMAC صحيح. لا endpoint لتغيير token بلا مصادقة. ملفات بيانات الخادم واعتمادات CLI محجوبة عن file API، مع استقلال صلاحيات عملية agy نفسها. السجل السابق للقراءة المقترنة، والأصل لا يرحّل ولا يحذف؛ استئناف المعرف يحتاج اختياراً صريحاً.

## التثبيت والإصدار

scripts/prepare_web_release.py يولد revision الـSW من بصمات الأصول؛ --check يرفض revision قديمة. Gradle وpackage_release يستدعيانه قبل الحزم.

scripts/package_release.py يحتاج --version و--output و--keystore أوSIGNING_KEYSTORE وJDK17؛ السر فيSIGNING_STORE_PASSWORD وSIGNING_KEY_ALIAS وSIGNING_KEY_PASSWORD فقط. Signer يطابق شهادة alias مع release-cert.der ولا يصدر المفتاح. النتيجة مجموعة ZIP/manifest/signature ثابتة تنشر ذرّياً محلياً في مجلدversion.

scripts/install_release.py يحتاج --archive و--manifest و--signature، وله --root و--certificate و--rollback و--verify-selected. يفحص توقيع البيان ببصمة الشهادة المثبتة، والجرد وكل بصمة قبل التفعيل. OpenSSL اعتماد نظام لازم؛ لا تثبيت اعتماد خفي أو تنزيلmutablemain. الحفظ خارج مجلدreleases، والرجوع لا يعيد البيانات القديمة. قفل تثبيت متروك إثر انقطاع لا يزال دليلاً يلزم فحصه؛ لا تزيله تلقائياً.

launch_server.sh يشغل launcher.py المحدد؛ المؤشرcurrent.json يختار إصداراً متحققاً. تغيير المؤشر لا يوقف عملية قائمة؛ يلزم إعادة تشغيل العملية المملوكة صراحةً. لا تعرض نجاح تشغيل إلا بعدhealth فعلي.

## التحقق والحدود

scripts/run_tests.py فحوص المرحلة الأولى؛ run_backend_tests.py HTTP/SSE والحفظ والعمليات والإرث؛ run_launcher_tests.py المدخل والملكية؛ run_release_tests.py التثبيت. الويب له run_tests.cjs وrun_ui_tests.cjs، مستبعدان منالحزمة. تشغيل headless يستعمل runtime المتاح بمسارات env ديناميكية دون نسخ قيم جهاز إلى الشفرة. Python يمرblack79 وflake8، وAndroid يمرtestDebugUnitTest وlintDebug وبناءdebug/release. افحص شهادة APK وأصولها فعلياً بعد البناء.

لا تحول نجاح Windows أوfixtures CLI أوChromium إلى إثبات Termux/الهاتف/قارئالشاشة/OTA. حفظ بيانات الهاتف ومطابقةشهادةالتطبيقالمثبت وفحوصهلا تزالقبولاً ميدانياً. اكتبكل تغيرجوهرى فيtask.md وproject_state.md وCHANGELOG.md، والمؤقتات تحت.tmp المستبعدة.

## عقد Termux المثبت بالبحث

راجع docs/termux-phone-diagnosis.md قبل تجارب التشغيل. RUN_COMMAND الخلفي في 0.119.0-beta.3 لا يحفظ bash من shebang env؛ يختار الأمر مفسر Bash صريحًا مشتقًا من dataDir ويمرر launch_server.sh وسيطًا ثابتًا، لا نص Shell حرًا. result.err فحص لازم؛ exitCode قد يغيب عند فشل سابق لبدء العملية، فلا تعد ذلك نجاحًا أو ردًا malformed لمجرد غيابه. لا تعرض STDIN أو stdout/stderr الخام في الواجهة أو السجل. OpenSSL أداة مستقلة في Termux باسم openssl-tool، واعتماد Python معلن في requirements.txt؛ لا تتجاوز المثبت عند غياب أحدهما.

## قبول الهاتف الآلي

scripts/run_phone_tests.py يشغل scripts/phone_acceptance.py في جلسة Termux خاصة بالفاحص عبر ADB. الهاتف الواحد المصرح شرط؛ --serial عند تعدد الأجهزة، والمسارات قابلة للتعيين. --phase يختار chat/device/voice أوall؛ --speech-audio ملف WAV مسموع من الحاسوب أمام ميكروفون الهاتف، وليس حقن نص. --output للتقرير و--resume للتقدم السابق؛ --help لا يتصل بالهاتف.

chat يستعمل مجلدًا مستقلًا، ومعرف طلب محفوظًا، وعلامة ذاكرة عشوائية وأحداث SSE؛ يثبت الإلغاء بزوال العملية المملوكة وبقاء عملية شاهد مستقلة، ثم يستأنف conversation_id نفسه. device يقصر أفعاله على قائمة Companion ويأخذ snapshot حديثًا قبل كل فعل. voice يفحص البدء والإلغاء والكلمات المعلومة في المسودة، وثبات أدوار المحادثة منعًا للإرسال التلقائي. لا تقبل success لأفعال مجهولة ولا تعاودها تلقائيًا، ولا تبدل خدمات الوصول أو الصوت أو الأذون.

التقرير حالات وأسباب محدودة؛ الرمز ومحتوى الشاشة والمحادثة والمعرفات تبقى في تخزين Termux الخاص. report.json تحت .tmp محليًا؛ لا تحفظ XML خامًا. blocked أوfail يعني قبولًا ناقصًا، لا نجاحًا. دليل الاستخدام والحدود: docs/phone-script-validation.md.

قرار 2026-10-05: عدم إعادة الفحوص بعد إصلاح Back، والعمل دون هاتف. لا تدّع قبول 1.3.3 ميدانيًا. تعذر voice_dictation ليس عيبًا أو مانع قبول بقرار المستخدم؛ يحتفظ بسبب blocked مع non_blocking:true ولا يختلق pass. Back يغلق dialog المفتوحة عبر dismissTopDialog من أصل WebView الموثوق، وعند غيابها يرجع Android كالمعتاد. CODEX_PLAYWRIGHT_MODULE يتيح استعمال Runtime Playwright المثبت بدل الحزمة المرفقة الناقصة؛ الفحص الرجوعي المضاف غير منفذ.

## حصيلة المراجعة المستقلة

2026-10-05: ستة عيوب أصلحت بعد مراجعة كامل الشفرة. package_release.py يرفض --version إن خالف version_name في server/version.json قبل إنشاء الناتج. EventLog يستعيد آخر سطر غير منتهٍ فقط، ويحفظ الأصل خاصًا باسم .interrupted- فريد؛ فساد السطر المكتمل يظل خطأً ولا إعادة للدور. MCP المعروض stdio/http فقط، وeffort المحفوظ يصل إلى الإنشاء والاستئناف. لا اختبارات ولا هاتف لهذه الإصلاحات بطلب المستخدم؛ التفصيل docs/independent-code-review.md.

Release المحلي الحالي 1.3.6/12؛ نجح البناء والتغليف الموقع، دون إعادة فحوص. تقرير المراجعة النهائي docs/independent-code-review.md، والقبول السابق يخص 1.3.2/8.

## إتمام عقود الخطة القديمة

2026-10-05: انقضاء أحداث البث وغلق جلسة CLI الساكنة وعقد أخطاء v1 مكتوبة؛ docs/code-completion-plan.md مرجع العمل. EventLog لا يحذف المحادثات: runs/sessions ونص الرد ومعرف الطلب تبقى. أحداث الدور المنتهي تُزال بعد 24 ساعة، أو الأقدم عند بلوغ 32 MiB؛ الدور الجاري والملفات المجهولة ونسخ .interrupted- تبقى. علامة events_expired وآخر last_event_id تُكتبان ذريًا في runs قبل الإزالة؛ عند انقطاع الإزالة يعاد إكمالها، وعند إخفاق الكتابة يبقى البث. التنظيف كسول عند الإقلاع وبدء دور أو طلب سجل، بلا daemon؛ SSE المنقضي يعيد replay_unavailable ولو ساوى cursor آخر الحدث. حد البيانات الإجمالي 50 MiB باق ولا حذف خفي للمحادثات.

POST /api/v1/sessions/{session_id}/close يغلق عملية CLI المملوكة وقارئ stderr ويحفظ الجلسة؛ 409 إن كان دور جارٍ أو بدأ دور أثناء الغلق. الخادم يملك مهمة الغلق حتى بعد انقطاع طلب المتصفح. newChat يستعمله قبل نسيان sessionId عند اتصال مقترن؛ القراءة المحلية عند غياب الاتصال باقية. مسارات v1 المجهولة والمخالفة ترجع 404/405، أما API القديم ف426.

أمثلة الانحدار الجديدة غير منفذة بأمر المستخدم؛ المراجعة ساكنة فقط. حذف نسخ assets القديمة مشروط بقبول الهاتف في الخطة ولم يتحقق؛ هي مستبعدة فعلًا من البناء، ولا تعلق كتابة الشفرة على غياب الهاتف. لا تعد complete code قبولًا ميدانيًا، ولا تضف الإملاء إلى العيوب.

تعذر الشبكة عند غلق الجلسة بعد توقف الخادم يعلن صراحة أن الغلق غير مؤكد، ويتيح قراءة النسخة المحلية؛ لا إعادة تلقائية. 409 وبقية أخطاء الخادم تبقى مانعة للانتقال. أصلحت هذه الحالة بالمراجعة الساكنة قبل البناء.

الحصيلة الحالية: complete code وفق المقابلة الساكنة للخطة؛ Debug وRelease1.3.5/11 وحزمة الخادم الموقعة مبنية. لا أمثلة جديدة منفذة ولا قبول ميداني جديد. docs/code-completion-report.md مرجع ما كتب وما بقي خارج الشفرة.

## إصلاح main وعقد الهاتف 1.3.6

2026-10-05: إصلاح المقارنة مأذون به، ولا commit/merge/push أو فحوص/هاتف. الخطة docs/main-parity-fix-plan.md. PATCH settings يرفض تعديل سياسة CLI غير الموصولة، بما فيها permissions وallow_* وsafe_mode/autopilot وdisabledSkills/disabledPlugins وmcpServers؛ القيم الأصلية تبقى، وtrustedWorkspaces/workspace_roots يقيدان Files فقط. plugins enable/disable ينفذهماCLI إذا أعلنت مساعدته الفعل، والمهارات والأوامر metadata محلية للقراءة في جذورmain الفعلية. helpقديخرجبstderr؛ لا تعرضstderrالتشخيصالخام للعمليات الأخرى. لا auth/testمخترع لـMCP ولاPTyعاملاستخراجأسرارالحساب.

WSAndroid يبدأjournal_ready/epoch32hex. GET /api/v1/device/epoch يقترن ويعيدهويةالسجل؛ action_id للمؤثرالجديدepoch:nonce، والمتقاعديرفضstale_epochدونإرسال. لا يعيدالمستهلكفعلًاقديمًا بهويةجديدة. tree/select/screenshotقراءاتلا تحفظصورهافيactions.jsonولاJavajournal. ActionLedger schema2 ثابتepoch؛الإخلاءCompleted/failedعند4096أو30MiB،pending/unknownباقية. Pythonيصونrunning/unknownوالlegacyالمحفوظ؛النتائجالمكتملةذاتepochمتقاعدتُخلّىذرّيًا. إذاامتلأالسجلبالمجهولوحدهفالمؤثرالجديديرفضصراحةوتبقىالقراءات؛ لا حذفخفيأوإعادةمجهول. APKوالخادمالجديدانيثبتانمعًا؛WSالقديملايعرفhandshake.

NativeRequestLedger يحدالجاريةويحفظنافذةمنجزةمحدودة،ومزامنللcallbacksالخلفية. BootReceiver يبقيrecoveryflagحتىHMACصحيحويعرضNotificationأصليةتفتحActivity؛منعالإشعارلايسقطالعلامة،ولايفعَّلإذنبدونالمستخدم. ليسوعدًابتشغيلخلفيصامتبعدكلboot.

GET /system/usage قياساتdisk/cpu/maximumRSSحقيقية؛عدمالدعمmemorynull،لا0مفترض. GET /doctor يثبتوجودCLIوتهيئةAndroidفقط،loginunknown. DoctorAndroidمصدرهget_app_version.native_status. حصصالحسابوMCPauth/testوتمكينالمهاراتالمنفردةأوتحديثCLIالعامتبينتعذرهاومسارTermux؛ليستنجاحًازائفًا. اقتراحاتCLI/skills/MCPمرتبطةبالمصادر،وeffortمحجوبصراحةعنداختيارنموذجبلادرجات؛القيمةالأصليةالمحفوظةتبقىحتىاختيارالمستخدم.

أسماء tones_enabled/haptic_enabledالقديمةمقبولةعندغيابsound/haptics. راجعالأسماءوالتركيزوالحالبالكتابةلأزرارcatalog؛المراجعةساكنة،لاقبولقارئشاشةفعلي. أمثلةالانحدارالجديدةغيرمنفذةبطلبالمستخدم.

سجل ActionLedger: حد32 MiB للrecords؛ هامش ثابت256 بايت لغلاف schema2 لا يسمح بزيادة سجلات. الهجرة قرب الحد تخلي completed/failed قبل الحفظ الأول وتحفظ الأصل في .previous؛ pending/unknown لا تزال. args المفقودة تطبع عند الإرسال وحده، وبصمة الطلب القديم تبقى. تقرير المقابلة الأحدث docs/main-parity-fix-report.md.

2026-10-05: ثُبّت Release1.3.6/12 على الهاتف عبر adb install -r دون مسح البيانات، وثُبّت الخادم الموقّع1.3.6 داخل Termux. أعاد المثبت status=installed؛ فُتح Companion وأظهر «الخادم متصل ومصادق». اقتصرت المعاينة على نتيجة التثبيت ورقم APK وحال الاتصال؛ لا فحص تفصيلي أو قبول شامل للهاتف/قارئ الشاشة/OTA.
