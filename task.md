# سجل العمل

## refactor: lean companion — 2026-10-16

complete_locally / awaiting_publication؛ اعتمد المستخدم التنفيذ الكامل لتعليق المطور6212526418 وملفي RFC/spec في preview/refactor-test، ثم الرفع والرد. [الخطة](docs/lean-companion-plan.md) وdebug_manifest.json يحصران حذف28ملفًا مسمىً وخمسة أيتام مثبتة، وتنظيف المستدعين وتشخيصTermux وشاشة البدء. النسخ السابقة في.tmp/LEAN-COMPANION. المواصفة الجديدة تنسخ إبقاء8765 والصوت الأصلي؛ الأمان والإعدادات والبيانات باقية.

| المرحلة | الحال |
|---|---|
| المواصفة والحصر والنسخ السابقة | complete |
| Android وDoctor والجسر وفحوصه الباقية | complete؛35 JVM ومراجعة مستقلة |
| شاشة البدء والمستدعون وفحوص المتصفح | complete؛ الأزرار الخمسة وفحوص المتصفح المستقلة |
| أدوات القبول والوثائق واعتمادWebSocket | complete؛ XML وBlack79 وflake8 |
| الفحص المجمع والحزمة والحجم | complete؛202 Python و35 JVM وبناء Debug؛ Lint صفر أخطاء/14 إنذارًا؛ APK4,256,680 بايت |
| Commit/push والتعليق | pending؛ مأذونة صراحة |

[حصيلة العمل وحدود الفحص](docs/lean-companion-report.md): إنذارات الفاحص النصي السابقة وmentions المستثنى باقية؛ حد التغيير100% لا يجتاز بعض ملفات الاعتزال المعماري. لا إصدار أو تثبيت أو دمج. نسخةspec1.4.0 ليست تغييرًا لإصدار التطبيق؛ لا ادعاء<100ms أو قبول هاتف بلا قياس.

## refactor: simplicity phases 2 and 3 — 2026-10-16

published / awaiting_maintainer_review؛ أذن المستخدم بعد المواصفة بتنفيذ الكل ورفعه والرد. اكتمل التبسيط المحلي وتوحيد صورة الإعدادات لدى adapter، مع صون المسودة وrevision والحفظ الجزئي والتركيز وحماية الرابعة. [الحصيلة](docs/simplicity-phases-2-3-report.md) تفصل202 Python و66 JVM والفحوص الناجحة والإنذارات السابقة وحدود القبول. هذا إذن من المستخدم، لا اعتماد جديد من المطور على توسيع الحصر. لا دمج أو Release أو تثبيت هاتف.

| الملف/المرحلة | الحال |
|---|---|
| المواصفة والخطة وdebug_manifest.json | complete؛ موضع error serialization الساقط من الحصر الأول موثق |
| server/cli_client.py وscripts/run_process_tests.py | complete؛ حذف الجرد المهمل، صون cwd والخطأ وعدم replay |
| MainActivity.java | complete؛ بقايا private فقط؛ لا تغيير layout/lifecycle |
| main-v1-adapter.js وmain-ui.js | complete؛ ملكية الصورة، baseline المسودة، السباقات والحفظ الجزئي، تسجيل SW واحد |
| run_main_ui_tests.cjs | complete؛ فحوص فعلية لنافذتين والتأخير والفشل والتركيز |
| مرآتا JS وsw.js وAPK | complete؛ 29 أصلًا و53 مدخل سيرفر وrepair متطابقة |
| الفحص المستقل وDebug/JVM/Lint | complete؛ نتائج وحدود مثبتة في الحصيلة |
| commit/push/comment | complete؛ c2204ca منشور ومتحقق؛ [تعليق المطور](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6209104399) |

بقية تقرير التبسيط خارج الجولة: البنود3،4،5،6،9،10،11،12،14،15،16،17،18،19،20. قبول الهاتف والحساب الحي وانقطاع agy الداخلي غير مثبتة؛ لا يجعل نجاح GET retry الطلب الداخلي مستأنفًا.

## fix: approved plugin identifier fallback — 2026-10-16

published / awaiting_maintainer_final_review؛ إصلاح السطر457/dispatch ومرآته منشور في f3f5c35، ورأس PR البعيد مطابق له. [اعتمد المطور الإصلاح والاستثناءين](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6204451761)، وأذن بالرفع. [أُبلغ باكتمال الرفع](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6208540429). المراجعة النهائية والدمج إلى main عند المطور؛ لا دمج أو Release أو قبول هاتف جديد في هذه الجولة. [حصيلة الإصلاح](docs/plugin-toggle-fix-report.md).

| النطاق | الحال |
|---|---|
| المانيفست والإذن والنسخ السابقة | complete |
| سطر canonical وسطر mirror | published؛ f3f5c35 |
| run_ui_tests وPython وJVM وDebug/Lint وحزمة APK | complete؛ نتائج الجولة موثقة في الحصيلة |
| validate_code --strict --human-grade | exempted_by_maintainer؛ إنذار Regex سابق في298؛ الفاحص لم يُعدّل |
| run_mentions_tests | exempted_by_maintainer؛ #prompt القديم في42؛ الفاحص لم يُعدّل |
| الرفع وإشعار المطور | complete؛ المراجعة النهائية والدمج ينتظران المطور |

## fix: scoped maintainer follow-up — 2026-10-15

review_snapshot_published؛ أذن المستخدم لاحقًا برفع الشفرة لفحص المطور رغم الفحوص الراسبة، مع بقاء قراره بعدم إصلاح الإضافات. نُفذ محليًا الحصر في التعليقين6195701813 و6195796462 دون إعادة كتابة أو حذف مسارات عاملة. [حصيلة الجولة](docs/scoped-maintainer-follow-up-report.md) مرجع العقود والفحوص والموانع. اعتماد الهاتف السابق تقرير المطور عن12c6040/ef04a14، لا قبولًا جديدًا لهذه الجولة.

| النطاق | الحال |
|---|---|
| Legacy floating voice وTTS والأفعال المحصورة/Escalation حتى5خطوات والإلغاء | complete_locally؛ يحتاج قبول الهاتف |
| Loopback8765 دونBearer | already_implemented؛ أعيد فحص الحراسة دون تغيير الإنتاج |
| run_ui_tests.cjs وrun_phone_tests.py | updated_locally؛ XML للهاتف ناجح؛ browser يكشف عيب الإضافات السابق |
| SSE GET reconnect بثلاث محاولات1/2/4s | complete_locally؛ نفسrun/cursor دونPOSTreplay |
| انقطاعstreamGenerateContent داخلagy | blocked؛ يلزم عقد استئناف الطلب نفسه؛ لا إعادةprompt مجهول الأثر |
| --help المهمل وتكرارprobe | complete_locally؛ بقيت mutation help وHMAC |
| الفحص | 201Python و66JVM وDebug/Lint وNode/Chromium المستقل وXML وSW/mirror ناجحة؛ ليس الكل ناجحًا |
| فاحصا browser الراسبان | run_ui_tests:178 plugins/undefined؛ run_mentions_tests:42 #prompt قديم خارج الحصر |
| قرار المستخدم في الإضافات | التزم بالحصر وأبلغ المطور؛ لا إصلاح إضافات |
| الرفع والرد | complete_for_review؛ رُفعت الشفرة في3a00eaf إلىorigin/codex/refactor-phase-1 بأمر المستخدم رغم الفحوص الراسبة؛ الرد: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6199776507 ؛ الموانع التقنية باقية |

## fix: address maintainer field acceptance blockers — 2026-10-15

complete_locally؛ أُصلحت مطالب التعليق 6192013512 الأربعة وفق [الخطة](docs/field-acceptance-fix-plan.md): WebView كامل مع تنبيه الوصول ولوحة HTTPS مضمّنة، mirror حرفي لأصول الويب داخل المصدر وAPK، قبول الخادم القديم دون منحه HMAC أو Bearer، وAntigravityBridge متزامن للصفحات القديمة فوق CompanionNative المحدود بالإطار والأصل. لا انتظار Python أو IndexedDB في لوحة البدء. قُيّدت نتائج الاتصال بجيل الصفحة، وتُعلن أخطاء Native داخل الواجهة.

| النطاق | الحال |
|---|---|
| MainActivity وCompanionWebViewClient وOriginPolicy وNativeBridgePolicy وServerConnection وNativeActionArguments | complete_locally |
| start.html وstart-ui.js وmain-v1-adapter.js وlegacy-native.js وفحوص Chromium | complete_locally |
| Gradle وsync_android_web.py وrun_android_web_asset_tests.py وapp/src/main/assets/web وSW | complete_locally |
| README وSKILL والخطة وسجل التحقق وCHANGELOG | complete |
| الفحص | complete؛ 201 Python و61 JVM/20 suite وChromium/Node وBlack79/flake8 وSW؛ Debug وLint ناجحان |
| تطابق APK | complete؛ 29 أصل ويب في assets/web وassets/server/web، و51 أصل خادم وrepair.html حرفيًّا |
| الرفع والرد على PR #1 | complete؛ التنفيذ12c6040 مرفوع إلىorigin/codex/refactor-phase-1 ومثبت فيPR؛ الرد: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6193094988 |
| قبول TalkBack/Jieshuo والخادم القديم على الهاتف والصوت والترقية الحية | pending؛ يحتاج إعادة قبول المطور؛ لا تثبيت أو نشر Release |


## feat: implement approved main UI and headless controls — 2026-10-15

complete_locally؛ اعتمد المطور الخطة في التعليق 6180568312، وأذن المستخدم بإتمامها والرفع والرد. اكتملت المطالب الأربعة: الصوت بلا فتح MainActivity، loopback WS، واجهة main تحت CSP مع API v1، والجسر والإيقاف المملوك. [حصيلة التنفيذ](docs/ui-main-adaptation-report.md) مرجع العقود وحدود القبول. 199 Python و53 JVM وChromium/Node وDebug ناجحة؛ الإملاء لا يرسل، والبث يستعاد دون إعادة POST، والأذون/OAuth تحفظ المالك والمراجعة. قبول الهاتف وagy/Termux/OTA الحي pending. النشر published؛ رُفع تنفيذ b6d47f3 إلى origin/codex/refactor-phase-1 وحُدّث وصف PR #1 وأُرسل الرد: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6182599115 . لا Release أو تثبيت هاتف.

| الملف أو النطاق | الحال |
|---|---|
| VoiceCommandActivity/FloatingVoiceController وHeadlessVoiceApi/HeadlessVoiceCommand | complete_locally |
| LocalAutomationServer/AutomationConnectionPolicy وMainActivity/NativeActionArguments/AntigravityAccessibilityService | complete_locally |
| فحوص JVM الثلاثة الجديدة | complete؛ الفحص العام 53 حالة |
| server/application.py وserver/server.py وscripts/run_shutdown_tests.py | complete؛ 6 حالات |
| server/runtime_status.py وscripts/run_backend_tests.py | complete؛ إصلاح update --help مثبت رجعيًا |
| index.html وstart.html وmain-ui/start-ui CSS/JS وmain-v1-adapter.js | complete_locally |
| sw.js وrun_main_ui_tests.cjs وrun_tests.cjs | complete_locally |
| README.md وSKILL.md والخطة والتقرير وCHANGELOG.md | complete |
| رفع فرع PR #1 والرد على المطور | complete؛ نُشر التنفيذ والرد بإذن المستخدم |
| قبول الهاتف والحساب والترقية الحية | pending؛ بيد المطور |

## feat: adopt maintainer main UI — 2026-10-14

awaiting_maintainer_approval؛ آخر تعليق للمطور 6176545650 ينسخ قرار إبقاء واجهة PR ويطلب واجهة main كاملة. [خطة المواءمة](docs/ui-main-adaptation-plan.md) complete؛ التنفيذ not_started. الأصل upstream/main@05470d6، لا origin/main. فُحصت 40 API قديمة وعقود البث والجسر وCSP؛ turns غير موجود وplugins مغلفة. لا تغيير للشفرة أو الواجهة؛ يلزم اعتماد نقل الواجهة وتكييف CSP والجسر وإيقاف الخادم المملوك. باقي القبول الميداني ثابت. طلب المستخدم عرض الخطة على المطور؛ نُشرت كاملة في 2026-10-15: https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6179106094. انتظار الاعتماد؛ لا تنفيذ إنتاجي أو commit/push لهذه المواءمة.


## chore: publish PR #1 fixes — 2026-10-14

published؛ أذن المستخدم بالرفع، وحُفظت الإصلاحات في d017f8819574e23fe9bf9d45de979a2322105703 ثم رُفعت رفعًا عاديًا إلى origin/codex/refactor-phase-1. تحقق git ls-remote وGitHub PR #1 من الرأس نفسه. فحوص ما قبل الحفظ ناجحة: 79 Python وChromium/Node وBlack79 وflake8 وSW. لا force أو merge أو رد جديد أو تثبيت هاتف؛ قبول الهاتف وagy الحي باقٍ.


## fix: implement all PR #1 maintainer comments — 2026-10-14

complete_locally؛ أذن المستخدم بتنفيذ التعليقات جميعًا؛ التعقيب الأخير يجيز الجلسة التلقائية للتطبيق والمتصفح المحلي بلا PIN. اكتمل CLI والاقتراحات وحقول الإعدادات والسياسات وتركيز الحوارات وحراسة Host/Origin/CSRF، مع بقاء Android HMAC/Bearer. [الحصيلة](docs/pr-1-maintainer-report.md): 79 Python، وفحوص Node وChromium، وBlack79 وflake8 وبصمة SW وgit diff --check ناجحة. المراجعة المستقلة أغلقت عيبي Host وslash؛ لا عيب مؤكد باقٍ في نطاقها. لا commit أو push أو رد جديد أو APK؛ قبول Termux/TalkBack/Jieshuo وagy الحي باقٍ. المسارات المقتبسة مثبتة في المسودة، وتوسيعها في CLI غير مختبر.

| الملف | الحال |
|---|---|
| server/cli_client.py | complete |
| server/cli_catalog.py | complete |
| server/runtime_status.py | complete |
| server/security.py | complete |
| server/application.py | complete |
| server/server.py | complete |
| server/web/app.js | complete |
| server/web/panels.js | complete |
| server/web/ui.js | complete |
| server/web/styles.css | complete |
| server/web/index.html | complete |
| server/web/sw.js | complete |
| scripts/run_backend_tests.py | complete |
| scripts/run_parity_tests.py | complete |
| scripts/run_pairing_tests.py | complete |
| scripts/run_settings_panel_tests.py | complete |
| server/web/run_ui_tests.cjs | complete |
| server/web/run_mentions_tests.cjs | complete |
| requirements-dev.txt | complete |
| README.md وSKILL.md | complete |
| docs/pr-1-maintainer-plan.md وdocs/pr-1-maintainer-report.md | complete |
| task.md وproject_state.md وCHANGELOG.md | complete |

## إصلاح مقابلة main 2026-10-14

fix: address main comparison findings — complete locally؛ أذن المستخدم بحفظ التغييرات وفتح طلب السحب (Pull Request) إلى المستودع الأصلي. تشمل إصلاحات نطاق MCP ومجموعات POSIX وإلغاء الكلام وضبط خروج الحساب.

| الملفات والنطاق | الحال |
|---|---|
| cli_client.py وmcp_probe.py وفحوص العمليات والنطاق | complete locally |
| android_client.py وrun_tts_tests.py | complete locally |
| auth_flow.py وAPI والويب وAndroid للخروج المثبت | complete locally |
| الحزمة والسجلات وطلب السحب | complete؛ أُنشئ PR #1 إلى ahanafy41/antigravity-companion:main |



## حفظ حصيلة الخطة 2026-10-08

feat: restore Companion features and safe execution — complete؛ أذن المستخدم بجمع التغييرات المتراكمة في commit هذه الجلسة. تشمل الوظائف والإصلاحات والسجلات وحزمة المصدر، بعد فحوصها المحلية؛ لا push أو نشر أو هاتف أو متصفح.

## استكمال وظائف الخطة 2026-10-08

feat: restore approved feature contracts — complete locally؛ التنفيذ المستقل وفحوصه مكتملان. اعتمد المستخدم الخيار الأول ونفذ المجدول وصف الدور التالي. الحصيلة docs/feature-completion-report.md؛ لا هاتف أو متصفح أو حساب حي أو نشر أو commit.

| الملفات والنطاق | الحال |
|---|---|
| auth_flow.py، mcp_probe.py، mcp_settings.py، run_auth_tests.py | complete locally |
| task_runtime.py، run_task_tests.py | complete locally؛ إلغاء subagent عبر الأب المملوك |
| NativeSpeech.java، SpeechRequest.java، PendingSpeech.java وأفعال Android وفحوصها | complete locally؛ قبول الهاتف باقٍ |
| voice_agent.py، voice_planner.py، run_voice_tests.py، run_planner_tests.py | complete locally؛ قبول agy الحقيقي والصوت باقٍ |
| application.py وMainActivity.java وTermuxBridge.java وواجهات الويب وrun_feature_tests.py وrun_features_tests.cjs | complete locally |
| الجدولة وتوجيه الدور الجاري | complete locally؛ local_tasks.py وrun_schedule_tests.py وAPI والويب |
| SKILL.md، CHANGELOG.md، project_state.md والتقرير وحزمة المصدر | complete؛ 66 ملف مصدر و46 أصل APK وصفحة الإصلاح مطابقة |

## إصلاح نتائج المراجعة 2026-10-08

fix: address local review findings — complete locally؛ أذن المستخدم بإصلاح كل العيوب المؤكدة. لا هاتف أو متصفح أو حساب حي أو نشر أو commit جديد.

| الملفات | الحال |
|---|---|
| AppUpdateManager.java، UpdateTransfer.java، UpdateTransferTest.java | complete؛ إلغاء التنزيل والتحقق والتسليم |
| MainActivity.java، NativeSecrets.java، ServerConnection.java، TermuxBridge.java، TermuxLaunchContract.java واختباره | complete؛ اكتشاف المنفذ المصادق |
| server/launcher.py، scripts/run_launcher_tests.py | complete؛ إبلاغ المنفذ الفعلي |
| ملفات Python ذات مآخذ Black وflake8 | complete؛ تصحيح المواضع المثبتة فقط |
| SKILL.md، project_state.md، CHANGELOG.md، docs/review-fixes-report.md، حزمة المصدر | complete؛ التوثيق والتحقق النهائي |

الحصيلة docs/review-fixes-report.md: 79 Python و35 JVM وNode وبناء Debug ناجحة؛ Black79 وflake8 نظيفان، وLint صفر أخطاء و24 ملحوظة سابقة. طابقت أصول APK المصدر، وطابقت حزمة المصدر وجردها 51 ملفًا. استرداد التكافؤ غير المكتمل باقٍ خارج إصلاح العيوب المثبتة. ملفات doctor.py وphone_acceptance.py: complete؛ ضبط فقط، دون تشغيل فاحص الهاتف.

## جمع التغييرات 2026-10-08

chore: commit all accumulated changes — complete؛ محفوظة في commit هذه الجلسة؛ أمر المستخدم بجمع كل التغييرات منذ آخر commit. فحص المسارات غير المستبعدة لم يرصد نمطًا ظاهرًا لاعتماد سري؛ ملفات التوقيع الخاصة والمؤقتات مستبعدة. لا هاتف أو متصفح أو push.

## إعداد السيرفر والويب 2026-10-08

chore: prepare server and web delivery — complete locally؛ جُدّدت بصمة SW وتوحدت السجلات وأُعدّت حزمة مصدر وجرد SHA256. نجح 77 فحص Python وفحص الويب الأساسي وصياغة JavaScript. فحص الهاتف والمتصفح مستبعدان بأمر المستخدم؛ لا نشر أو commit. الحصيلة docs/server-web-delivery.md.

| الملفات | الحال |
|---|---|
| server/web/sw.js | complete |
| project_state.md، task.md، CHANGELOG.md، docs/server-web-delivery.md | complete |
| مصادر السيرفر والويب اللازمة للتسليم | complete؛ حزمة مصدر وجرد وفحص محلي |

## خطة التكافؤ 2026-10-07

feat: feature parity restoration — in_progress؛ اعتمد المستخدم الخطة؛ بدأ التنفيذ المحلي والفحوص. لا حساب أو ترقيةCLI فعلية أو هاتف أو نشر في هذا الطلب.

| الملفات | الحال |
|---|---|
| docs/main-feature-baseline.md، docs/feature-restoration-contracts.md | complete |
| docs/feature-parity-spec.md، docs/feature-restoration-plan.md | complete؛ اعتمدت الخطة وفق سجل العمل أعلاه |
| العقود والحصص والترقية والأذون والمهارات وأفعالAndroid | in_progress؛ تنفيذ وفحص محلي |
| دخول الحساب وMCP والمهام والصوت | complete locally؛ قبول التكامل الحقيقي باقٍ، والجدولة والتوجيه pending_decision |
| قبول الحساب والهاتف وOTA الحقيقي | not_started؛ يحتاج فعلًا مأذونًا مخصوصًا |

## تدقيق 2026-10-07

fix: branch audit — complete locally؛ أصلحت العيوب الستة ومسالك الانقطاع والاختيار التي كشفها التدقيق المستقل. الخطة docs/branch-audit-fix-plan.md والحصيلة docs/branch-audit-fix-report.md؛ لا commit أو push أو نشر أو هاتف.

| الملفات | الحال |
|---|---|
| server/sessions.py، server/cli_client.py، server/application.py، scripts/run_backend_tests.py | complete |
| server/web/panels.js، server/web/run_ui_tests.cjs، server/web/sw.js | complete |
| MainActivity.java، AppUpdateManager.java، ServerConnection.java، AntigravityAccessibilityService.java | complete |
| ElementClick.java، UpdateCompatibility.java، ElementClickTest.java، UpdateCompatibilityTest.java | complete |
| تدقيق مستقل وحصيلة الفحوص | complete locally؛ Python63 وAndroid25 والويب ناجحة؛ Lint0أخطاء/24تحذيرًا؛ 39 أصلAPK مطابقة |

تاريخ الحال 2026-10-05. الفرع codex/refactor-phase-1؛ المصدر 1.3.6/12، والهاتف حاليًا1.3.6/12؛ قبوله التفصيلي السابق1.3.2/8. التنفيذ والتجربة مأذونان، ولا commit أو push أو نشر.

| المرحلة | الحال | الدليل والباقي |
|---|---|---|
| 1 العقود والفاحص | complete locally | help الفعلي و8 فحوص؛ المحادثة والإلغاء والاستئناف ثبتت على الهاتف |
| 2 المصدر والعمليات | complete locally | مصدر واحد وملكية عملية وحفظ معرف الطلب |
| 3 HTTP والحفظ | complete locally | 24 فحصًا وعزل ومراجعة إعدادات؛ HMAC/bootstrap مثبتان على الهاتف |
| 4 الواجهة | complete locally | Node/Chromium؛ الواجهة المقترنة ظهرت على الهاتف |
| 5 Android | complete locally | 14 فحصًا وبناء وLint؛ tree واللقطة مثبتان على الهاتف |
| 6 الترقية | complete locally | توقيع وتثبيت ورجوع ورفض عبث محليًا؛ تثبيت1.3.2 على الهاتف؛ OTA بعيد باق |
| 7 الاعتماد والتنظيف | code_complete; acceptance_pending | كتابة العقود مكتملة؛ Back وقارئات الشاشة وOTA وإزالة النسخ القديمة عند تحقق شرط القبول باقية؛ الإملاء مستثنى |

## جرد الملفات المنجزة

complete يثبت إتمام العمل المبيّن؛ نتائج الفحوص السابقة تخص نسخها، والإصلاحات الأخيرة لم تُعد فحوصها بأمر المستخدم. لا يعد ذلك قبولًا ميدانيًا شاملًا. مسار keystore نقل إلى حفظ خاص مع نسخة موثقة، وليس إتلافًا للمفتاح؛ التاريخ باق.

| الملف | الحال |
|---|---|
| `.gitattributes` | complete |
| `.github/workflows/build-apk.yml` | complete |
| `.gitignore` | complete |
| `CHANGELOG.md` | complete |
| `docs/independent-code-review.md` | complete |
| `docs/code-completion-plan.md` | complete |
| `docs/code-completion-report.md` | complete |
| `docs/main-parity-fix-plan.md` | complete |
| `server/cli_catalog.py` | complete code |
| `server/runtime_status.py` | complete code |
| `app/src/main/java/com/antigravity/companion/NativeRequestLedger.java` | complete code |
| `README.md` | complete |
| `SKILL.md` | complete |
| `app/build.gradle` | complete |
| `app/keystore/antigravity-release-key.jks` | complete |
| `app/src/main/AndroidManifest.xml` | complete |
| `app/src/main/assets/repair.html` | complete |
| `app/src/main/java/com/antigravity/companion/ActionLedger.java` | complete |
| `app/src/main/java/com/antigravity/companion/AntigravityAccessibilityService.java` | complete |
| `app/src/main/java/com/antigravity/companion/AppUpdateManager.java` | complete |
| `app/src/main/java/com/antigravity/companion/BootReceiver.java` | complete |
| `app/src/main/java/com/antigravity/companion/CompanionWebViewClient.java` | complete |
| `app/src/main/java/com/antigravity/companion/DeviceArguments.java` | complete |
| `app/src/main/java/com/antigravity/companion/DoctorDiagnosticEngine.java` | complete |
| `app/src/main/java/com/antigravity/companion/FloatingVoiceController.java` | complete |
| `app/src/main/java/com/antigravity/companion/LocalAutomationServer.java` | complete |
| `app/src/main/java/com/antigravity/companion/MainActivity.java` | complete |
| `app/src/main/java/com/antigravity/companion/NativeProof.java` | complete |
| `app/src/main/java/com/antigravity/companion/NativeSecrets.java` | complete |
| `app/src/main/java/com/antigravity/companion/OriginPolicy.java` | complete |
| `app/src/main/java/com/antigravity/companion/PhoneResultBudget.java` | complete |
| `app/src/main/java/com/antigravity/companion/ScreenSnapshot.java` | complete |
| `app/src/main/java/com/antigravity/companion/ServerConnection.java` | complete |
| `app/src/main/java/com/antigravity/companion/TermuxBridge.java` | complete |
| `app/src/main/java/com/antigravity/companion/TermuxLaunchContract.java` | complete |
| `app/src/main/java/com/antigravity/companion/UpdatePolicy.java` | complete |
| `app/src/main/java/com/antigravity/companion/VoiceCapture.java` | complete |
| `app/src/main/java/com/antigravity/companion/VoiceCommandActivity.java` | complete |
| `app/src/main/res/xml/file_paths.xml` | complete |
| `app/src/main/res/xml/network_security_config.xml` | complete |
| `app/src/test/java/com/antigravity/companion/ActionLedgerTest.java` | complete |
| `app/src/test/java/com/antigravity/companion/DeviceArgumentsTest.java` | complete |
| `app/src/test/java/com/antigravity/companion/NativeProofTest.java` | complete |
| `app/src/test/java/com/antigravity/companion/OriginPolicyTest.java` | complete |
| `app/src/test/java/com/antigravity/companion/PhoneResultBudgetTest.java` | complete |
| `app/src/test/java/com/antigravity/companion/TermuxLaunchContractTest.java` | complete |
| `app/src/test/java/com/antigravity/companion/UpdatePolicyTest.java` | complete |
| `docs/phase-1-baseline.json` | complete |
| `docs/phase-1-contracts.md` | complete |
| `docs/phase-1-inventory.md` | complete |
| `docs/phase-1-local-evidence.json` | complete |
| `docs/phase-1-validation.md` | complete |
| `docs/phone-validation.md` | complete |
| `docs/refactor-plan.md` | complete |
| `docs/refactor-validation.md` | complete |
| `docs/release-and-recovery.md` | complete |
| `docs/termux-phone-diagnosis.md` | complete |
| `project_state.md` | complete |
| `requirements.txt` | complete |
| `scripts/ReleaseSigner.java` | complete |
| `scripts/install_release.py` | complete |
| `scripts/package_release.py` | complete |
| `scripts/phase1_preflight.py` | complete |
| `scripts/prepare_web_release.py` | complete |
| `scripts/run_backend_tests.py` | complete |
| `scripts/run_launcher_tests.py` | complete |
| `scripts/run_release_tests.py` | complete |
| `scripts/run_tests.py` | complete |
| `server/android_client.py` | complete |
| `server/application.py` | complete |
| `server/cli_client.py` | complete |
| `server/launch_server.sh` | complete |
| `server/launcher.py` | complete |
| `server/legacy_conversations.py` | complete |
| `server/release-cert.der` | complete |
| `server/security.py` | complete |
| `server/server.py` | complete |
| `server/sessions.py` | complete |
| `server/storage.py` | complete |
| `server/version.json` | complete |
| `server/web/api.js` | complete |
| `server/web/app.js` | complete |
| `server/web/history.js` | complete |
| `server/web/index.html` | complete |
| `server/web/manifest.json` | complete |
| `server/web/native.js` | complete |
| `server/web/panels.js` | complete |
| `server/web/run_tests.cjs` | complete |
| `server/web/run_ui_tests.cjs` | complete |
| `server/web/state.js` | complete |
| `server/web/styles.css` | complete |
| `server/web/sw.js` | complete |
| `server/web/ui.js` | complete |
| `server/web/vendor/alpine-LICENSE.md` | complete |
| `server/web/vendor/alpine-csp.min.js` | complete |
| `server/web/vendor/dompurify-LICENSE.txt` | complete |
| `server/web/vendor/manifest.json` | complete |
| `server/web/vendor/marked-LICENSE.md` | complete |
| `server/web/vendor/marked.umd.js` | complete |
| `server/web/vendor/purify.min.js` | complete |
| `server/web/vendor/tailwind-LICENSE.txt` | complete |
| `server/web/vendor/tailwind-input.css` | complete |
| `server/web/vendor/tailwind.min.css` | complete |
| `setup.sh` | complete |
| `task.md` | complete |

## حصيلة الاستئناف

كان عائق الهاتف غياب openssl-tool وaiohttp؛ حُصلا بعد تشخيص محدد وإذن تحديث فهارس apt دون ترقية عامة. ثبت CRLF ثم اختلاف shebang في RUN_COMMAND؛ أوقف الوكيل التجارب، وبحث المصدر الموسوم والشفرة القديمة وأعاد المعالج محليًا قبل الإصلاح. نجح العقد ومراجعته ثم فحص قبول واحد محدد في 1.3.2: البدء البارد والاقتران وHMAC/bootstrap وtree واللقطة. التفاصيل docs/termux-phone-diagnosis.md وdocs/phone-validation.md.

## الباقي

إصلاح Back الجديد غير متحقق منه على الهاتف بطلب المستخدم؛ الصوت غير محسوم ومستثنى من العيوب. OTA بعيد ورفض أدوات CLI وقبول شامل لقارئات الشاشة وأجهزة أقدم باقية. assets القديمة مستبعدة وباقية إلى قبول الهاتف؛ انقضاء أحداث البث بعد24ساعة وإخلاء الأقدم ضمن32MiB مكتوبان، والمحادثات محفوظة. حد50MiB يرفض الجديد دون حذفها. لم تُهيأ أسرار CI ولم ينشر شيء. كل حالة جديدة تقيد هنا وفي project_state.md وCHANGELOG.md.

## قبول الهاتف الآلي الجاري

2026-10-04: طلب المستخدم سكربتًا ينفذ المحادثة والإلغاء والاستئناف والإملاء وإلغاءه وأفعال الضغط والتمرير والرجوع على الهاتف. scripts/phone_acceptance.py وscripts/run_phone_tests.py: complete locally؛ آخر إصلاحات الفاحص غير معادة الفحص بطلب المستخدم. البحث في عقود API والشفرة الأصلية ومصادر Android سبق التنفيذ. الفحوص تستعمل مجلدًا معزولًا وعبارة صوتية معلومة؛ لا تبديل لخدمات المستخدم أو إعداداته، ولا خروج للرموز أو الشاشة في التقرير.

## حصيلة السكربت

2026-10-05: المحادثة والتذكر وSSE والإلغاء وزوال العملية واستئناف معرف المحادثة والضغط والتمرير: complete على 1.3.2. Back: إصلاح المصدر complete، والقبول الميداني not_started بطلب عدم إعادة الفحص. الصوت: inconclusive، لا يعد عيبًا بقرار المستخدم. الهاتف غير متصل؛ لا أوامر ADB لاحقة.

| الملف الجديد | الحال |
|---|---|
| scripts/phone_acceptance.py | complete locally |
| scripts/run_phone_tests.py | complete locally; final amendments unverified |
| docs/phone-script-validation.md | complete |

2026-10-05: اكتمل بناء Release 1.3.3/9 في 47 ثانية، وحزمة الخادم الموقعة في .tmp/release/1.3.3. APK في app/build/outputs/apk/release/app-release.apk. لا إعادة فحوص ولا اتصال هاتف؛ Debug السابق باق 1.3.2/8. clean-code-guard مراجعة شفرة فقط؛ الفحص الرجوعي الجديد غير منفذ، والقبول الميداني للإصلاح غير محسوم.

## المراجعة المستقلة الجارية

2026-10-05: طلب المستخدم وكيلاً مستقلاً لمراجعة كامل الشفرة الجديدة بمهارات ponytail وclean-code-guard وcode-review، ثم إصلاح العيوب المثبتة. جرد 72 ملف شفرة وضبط في .tmp/independent-review/inventory.json؛ المقارنة مع HEAD 281089c90201 وتشمل الملفات غير المتتبعة. مراجعة Standards وSpec ساكنة؛ لا اختبارات أو هاتف، وتعذر الإملاء ليس عيبًا. الحال in_progress، والتقرير والتغطية تحت .tmp/independent-review.

2026-10-05: أصلحت نتائج الوكيل الستة: precache، MCP، هوية الحزمة، رابط Markdown، ذيل NDJSON وeffort. docs/independent-code-review.md: complete؛ مراجعة الإصلاحات وبناء 1.3.4/10: in_progress. أمثلة الانحدار المضافة غير منفذة؛ لا هاتف ولا إعادة فحوص.

## حصيلة المراجعة والإصلاح

2026-10-05: المراجعة المستقلة والإصلاح: complete. شملت 70 ملف شفرة وضبط وفحص، وملفي دليل تاريخي. Standards: عيب واحد؛ Spec: خمسة؛ جميعها أصلحت. المراجعة الساكنة الختامية لم تجد عيب إنتاج مؤكّدًا؛ أصلح فرق newline في مثال Markdown أيضًا. بناء Release 1.3.4/10 نجح في 33 ثانية، وحزمة الخادم وقعت في .tmp/release/1.3.4 دون استبدال إصدارات سابقة. لا اختبارات أو lint أو تحقق شهادة مستقل أو هاتف. Debug السابق 1.3.2/8، والقبول الميداني للإصلاحات غير محسوم. التفاصيل docs/independent-code-review.md؛ بقية المرحلة السابعة ثابتة.

2026-10-05: إكمال كتابة الشفرة: in_progress بإذن المستخدم؛ الخطة docs/code-completion-plan.md تشمل انقضاء الأحداث، وغلق الجلسة الساكنة، وعقد 404/405. لا فحوص أو هاتف؛ حذف النسخ القديمة يظل مشروطًا بقبول ميداني.

2026-10-05: الشفرة في sessions/application/app وأمثلة الانحدار: complete code؛ مراجعة المواضع الأخيرة وبناء 1.3.5/11: in_progress. لا اختبارات أو هاتف. النسخ القديمة غير الداخلة في البناء لا تحذف قبل استيفاء شرط القبول.

## حصيلة إتمام كتابة الشفرة

2026-10-05: complete code وفق مقابلة الخطة الأصلية والمعتمدة والمراجعة الساكنة المستقلة. اكتملت عقود انقضاء أحداث البث وغلق CLI الساكن وأخطاء v1، ومعالجة القراءة المحلية عند انقطاع close. خمسة أمثلة backend وسيناريوها UI مكتوبة غير منفذة. نجح بناء Debug وRelease 1.3.5/11 في 48 ثانية، ووقعت حزمة الخادم في .tmp/release/1.3.5، دون استبدال الإصدارات السابقة. لا اختبارات أو lint أو black/flake8 أو تحقق شهادة مستقل أو هاتف. الهاتف آخره1.3.2/8؛ الإصدار الجديد غير مثبت. المرحلة السابعة acceptance_pending: قبول الهاتف وقارئات الشاشة وOTA وإزالة assets القديمة عند تحقق شرط القبول باقية؛ لا نقص برمجي مؤكّد باقٍ في مقابلة الخطة. التقرير docs/code-completion-report.md. لا commit أو push أو نشر.

2026-10-05: إصلاح نتائج المقارنة مع main: in_progress بإذن المستخدم؛ الخطة docs/main-parity-fix-plan.md. أكّد التدقيق أن حصيلة الإتمام السابقة ليست تكافؤًا كاملًا معmain. لا اختبارات/هاتف/commit/merge. وكيل Android ووكيل الويب يعملان في ملفات منفصلة، وroot يملك Python والعقود والسجلات.

2026-10-05: إصلاحاتmainومواءمةepochوmetadataوالسياسةوالإحصاءوDoctor:complete code؛المراجعةالختاميةوالبناء1.3.6/12:in_progress. أمثلةPython/Java/JSمكتوبةغيرمنفذة؛لاPhone/commit/merge. العقودالغائبةلهابيانتعذر،ولايدّعىتكافؤكامللكلوظائفmainالقديمةالمتجاوزةللعقود.

2026-10-05: المراجعة المستقلة الأخيرة: complete static review؛ أصلح إرسال args دون تبديل بصمة الطلبات القديمة. لا finding مؤكد باقٍ في نطاق المراجعة. البناء1.3.6/12: in_progress. المرجع docs/main-parity-fix-report.md؛ لا اختبارات أو هاتف أو commit/merge.

2026-10-05: إصلاح العيوب المؤكدة ومراجعتها الساكنة: complete؛ نجح بناء Debug وRelease1.3.6/12 في56 ثانية، وأعدت حزمة الخادم الموقعة .tmp/release/1.3.6/companion-server-1.3.6.zip دون استبدال السابق. أمثلة الانحدار غير منفذة بطلب المستخدم؛ لا هاتف أو lint أو تحقق شهادة مستقل أو commit/merge/push. يلزم APK والخادم معًا لعقد journal_ready. القبول الميداني والعقود غير المدعومة وحدود الدمج في docs/main-parity-fix-report.md.

2026-10-05: ثُبّت Release1.3.6/12 على الهاتف عبر adb install -r دون مسح البيانات، وثُبّت الخادم الموقّع1.3.6 داخل Termux. أعاد المثبت status=installed؛ فُتح Companion وأظهر «الخادم متصل ومصادق». اقتصرت المعاينة على نتيجة التثبيت ورقم APK وحال الاتصال؛ لا فحص تفصيلي أو قبول شامل للهاتف/قارئ الشاشة/OTA.
