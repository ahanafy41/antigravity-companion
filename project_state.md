# حالة المشروع

## refactor: final lean cleanup — 2026-10-16

published / awaiting_maintainer_review؛ أمر المستخدم بتنفيذ الحصر الأخير في تعليق6220674524. [الخطة](docs/final-lean-cleanup-plan.md) وdebug_manifest.json يقيدان حذف الدالة والموارد السبعة وapp.js/panels.js فقط ومراياهما ومساراتهما، ونقل فحوص الواجهة المعتزلة إلى الواجهة الحالية. الخادم ومدخله وlauncher وبثArtifacts خارج هذه الجولة؛ لا استيراد. حارس رفضspeech_enabled باقٍ، ولا مستمع صوت نشط ليحذف.

الحصر والنسخ السابقة والتنفيذ الإنتاجي complete؛202 Python و35 JVM وبناءDebug ناجحة، وLint صفر أخطاء/6إنذارات. نقل الفحوص والمراجعة المستقلة complete؛ ثغرتا التغطية أصلحتا واجتازتا الفحص الطبيعي والتحوير السلبي. APK4,207,180بايت؛27أصل ويب و51مدخل خادم متطابقة؛ Commit/push/comment complete؛4e3371d منشور ومطابق للرأس البعيد؛ [تعليق التسليم](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6221390646). [الحصيلة](docs/final-lean-cleanup-report.md). لا إصدار أو تثبيت أو دمج. البقايا الثلاثة state.js/ui.js/styles.css باقية وفق الحصر الأخير.


## refactor: lean companion — 2026-10-16

published / awaiting_maintainer_review؛ اعتمد المستخدم التنفيذ الكامل لتعليق المطور6212526418 وملفي RFC/spec في preview/refactor-test، ثم الرفع والرد. [الخطة](docs/lean-companion-plan.md) وdebug_manifest.json يحصران حذف28ملفًا مسمىً وخمسة أيتام مثبتة، وتنظيف المستدعين وتشخيصTermux وشاشة البدء. النسخ السابقة في.tmp/LEAN-COMPANION. المواصفة الجديدة تنسخ إبقاء8765 والصوت الأصلي؛ الأمان والإعدادات والبيانات باقية.

| المرحلة | الحال |
|---|---|
| المواصفة والحصر والنسخ السابقة | complete |
| Android وDoctor والجسر وفحوصه الباقية | complete؛35 JVM ومراجعة مستقلة |
| شاشة البدء والمستدعون وفحوص المتصفح | complete؛ الأزرار الخمسة وفحوص المتصفح المستقلة |
| أدوات القبول والوثائق واعتمادWebSocket | complete؛ XML وBlack79 وflake8 |
| الفحص المجمع والحزمة والحجم | complete؛202 Python و35 JVM وبناء Debug؛ Lint صفر أخطاء/14 إنذارًا؛ APK4,256,680 بايت |
| Commit/push والتعليق | complete؛3abcb0e منشور ومتحقق؛ [رد المطور](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6215146811) |

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

complete_locally؛ [الحصيلة](docs/pr-1-maintainer-report.md) مرجع التغيير والفحص. جلسة تلقائية للتطبيق والمتصفح المحلي بلا PIN بأمر المستخدم الأخير؛ HttpOnly/SameSite وpeer loopback وHost/Origin/Fetch Metadata وCSRF باقية، وAndroid bootstrap يحتفظ بـHMAC/Bearer. الثقة تشمل كل عميل محلي؛ لا يدّعى إثبات هويته بالأصل.

CLI يقرأ JSON الإضافات والقائمة الخالية وTAB/spinner و--version، ويكتشف slash من TOML والمهارات المفعلة المعلنة؛ الواجهة لا تعيد المهارات المحظورة أو أسماء مجلداتها. اقتراح الملفات والمجلدات بحسب cwd الفعلي يحرس الرد القديم والسباق؛ الحوارات تحفظ التركيز، والإعدادات والأذون حقول معنونة تحفظ المعدل وحده. requirements-dev.txt لفحوص التطوير فقط؛ runtime وهوية الإصدار وإعدادات المستخدم لم تتغير. SW مجددة.

نجح 79 Python وفحصا Node وفحوص Chromium الشامل والاقتراحات والإعدادات وخادم aiohttp الحقيقي، وBlack79 وflake8 وgit diff --check. المراجعة المستقلة أصلحت Host المعطوب وإعادة مهارات slash المحظورة. قبول الهاتف/قارئات الشاشة وحساب agy وتوسيع المسارات المقتبسة في CLI باقٍ؛ لا build/install أو commit/push أو رد جديد. deliverables تبقى لقطاتها المؤرخة؛ لا مزامنة ضمنية. الخطوة التالية: مراجعة الفرق، ثم النشر أو قبول الهاتف عند الإذن.

## إصلاح مقابلة main 2026-10-14

fix: address main comparison findings — complete locally؛ أذن المستخدم بحفظ جميع التغييرات وفتح طلب السحب (Pull Request) إلى المستودع الأصلي. نطاق الإصلاح يشمل MCP/POSIX/TTS وعقد خروج الحساب.

## حفظ حصيلة الخطة 2026-10-08

حصيلة وظائف الخطة والإصلاحات وحزمة المصدر محفوظة في commit هذه الجلسة بأمر المستخدم. آخر تحقق: 155 Python و44 JVM وفحصا Node، Debug مبني وLint صفر أخطاء/24 ملحوظة سابقة؛ 66 ملف مصدر و46 أصل APK وصفحة الإصلاح مطابقة. قبول التشغيل الحقيقي خارج الفحص المحلي؛ لا push أو نشر.

## استكمال وظائف الخطة 2026-10-08

complete locally؛ دخول الحساب وMCP عبر native handoff، وفحص MCP البروتوكولي، وحفظ OAuth ذريًا دون عرض السرّ، وسياسة الأذون، وجرد runs/subagents وإلغاء الأب المملوك، وأفعال Android، وTTS والتحكم الصوتي المحدود، والتنبيه بحسب الظهور وعرض النسخ موصولة. 155 Python و44 JVM وفحصا Node ناجحة؛ Black79 وflake8 نظيفان؛ Debug مبني وLint صفر أخطاء/24 ملحوظة سابقة. الحصيلة docs/feature-completion-report.md. voice planner يستعمل agent مملوكًا بلا tools/MCP/skills/plugins ويتحقق من init.tools قبل قبول النتيجة؛ قبول اكتشافه في agy الحقيقي باقٍ. الإلغاء يحفظ request tombstone، والأثر الجاري المجهول لا يعاد تلقائيًا. اعتمد المستخدم الخيار الأول صراحة؛ LocalTasks وصف الدور التالي مكتملان محليًا: موعد واحد UTC، skip/run_once للفوات بعد الإغلاق، occurrence ثابت قبل التنفيذ، FIFO محفوظ وإلغاء مملوك. الحارس يمنع تجاوز الرسائل المنتظرة؛ لا خدمة نظام والخادم مغلق. لا هاتف أو متصفح أو دخول حساب حي أو نشر أو commit؛ لا رفع لإصدار 1.3.6/12.

## إصلاح نتائج المراجعة 2026-10-08

complete locally؛ أصلح إلغاء ترقية APK واكتشاف منفذ الخادم بعد إثبات HMAC، مع حفظ settings.json وإعداد المستخدم. Black79 وflake8 نظيفان لجميع server وscripts. نجح 79 Python و35 JVM وNode وبناء Debug؛ Lint صفر أخطاء و24 ملحوظة سابقة. حزمة المصدر وجردها مجددان، وأصول APK مطابقة. الخطة docs/review-fixes-plan.md والحصيلة docs/review-fixes-report.md؛ استرداد الوظائف الأخرى غير مكتمل. الهاتف والمتصفح مستبعدان بأمر المستخدم؛ لا نشر أو commit جديد، ولا تغيير إصدار الإنتاج 1.3.6/12.

## حفظ التغييرات 2026-10-08

complete؛ جُمعت جميع التغييرات المتراكمة غير المستبعدة في commit هذه الجلسة بأمر المستخدم؛ شجرة العمل نظيفة بعد الحفظ. حذف المفتاح من الشجرة داخل النطاق، والنسخ الخاصة تحت .tmp تبقى مستبعدة. استرداد التكافؤ غير مكتمل؛ لا قبول هاتف أو متصفح أو نشر مستنتج من الحفظ.

## إعداد السيرفر والويب 2026-10-08

complete locally؛ جُدّدت بصمة SW واجتاز المصدر فحصها. نجح 77 فحص Python وفحص الويب الأساسي وصياغة JavaScript. حزمة المصدر والجرد تحت deliverables/server-web-2026-10-08؛ لا ترقية مثبتة أو حزمة إنتاج موقعة جديدة. الهاتف والمتصفح مستبعدان بأمر المستخدم، واسترداد التكافؤ جارٍ وغير مكتمل. الحصيلة docs/server-web-delivery.md.

## مقصد التكافؤ 2026-10-07

اختار المستخدم استعادة وظائف main بدل تقليص المنتج. البحث والخطة complete؛ التنفيذ in_progress وفق task.md بعد اعتماد docs/feature-restoration-plan.md، والمعيار docs/feature-parity-spec.md. الأصل والعقود في docs/main-feature-baseline.md وdocs/feature-restoration-contracts.md. تُصحّح أحكام التعذر السابقة: update معلن، وقراءة /usage خارج stream-json موثقة، وpermissions لها ملف رسمي. المحرك المستقل بلا backend مثبت فيmain؛ الجدولة وإلغاءsubagents ناقصان فيالأصل. أفعال Home/Recents/Notifications وفتح التطبيقات والوكيل الصوتي/TTS فجوات أصلية مثبتة أضيفت للخطة. لا قبول بأن وظيفة متروكة عمدًا دون قرار صريح؛ لا تعاد آليات استخراج رموز الحساب أو تجاوز الأذون أوcode مولد. نتيجة إصلاح التدقيق السابقة محفوظة؛ استرداد التكافؤ جارٍ وغير مكتمل، ولا قبول حساب جديد أو هاتف.

## العمل الجاري 2026-10-07

إصلاح تدقيق الفرع complete locally؛ العيوب الستة ومسالك الحفظ والاختيار الإضافية أصلحت وراجعت استقلالًا. جلسات/runs تبقيان بصيغتهما مع سجل معاملة مؤقت يستعاد قبل القراءة؛ لا إعادة CLI مجهول. health يعلن device_protocol، وفتح مثبت APK محروس بإثبات HMAC وتوافق النسخة والعقد. إلغاء Windows يقصر taskkill على PID المملوك وشجرته، ويرفض الإلغاء غير المؤكد. Python63 وAndroid25 والويب/Chromium نجحت، وLint صفر أخطاء و24 تحذيرًا؛ Debug مبني و39 أصلAPK مطابقة. مرجع المقارنة main المحلي؛ mmaster غير موجود. التقرير docs/branch-audit-fix-report.md. لا هاتف أو OTA فعلي أو Release جديد أو commit أو push أو نشر؛ لا تزال الوظائف المتروكة عمدًا تمنع دعوى تكافؤ كامل معmain.

تاريخ الحال: 2026-10-05. الفرع: codex/refactor-phase-1. المصدر الجديد: 1.3.6، Android رقم 12؛ الهاتف حاليًا 1.3.6/12؛ آخر قبول تفصيلي1.3.2/8. المستخدم أذن بإتمام إعادة الهيكلة وبالتجربة على هاتفه؛ لا commit أو push أو نشر.

## البنية

server/ مصدر Python والويب الواحد؛ ملفات متجاورة للحفظ والأمن وCLI والجلسات وAndroid والسجل السابق. aiohttp على 127.0.0.1 وAPI/v1 مع اقتران وHttpOnly وCSRF. الويب Alpine CSP وأصول محلية؛ Gradle يولد assets ويستبعد الأصل المكرر. JSON/NDJSON خارج releases، وحفظ الإعدادات بمراجعة مع بقاء الحقول المجهولة والأسرار غير المعروضة.

عملية وقراءة stdout واحدة لكل دور؛ طلب محفوظ ومعرف يمنع تكراره، وEOF أو المجهول إخفاق. SSE محفوظ ولا إعادة آلية لدور أو فعل مجهول. CLI مالك تعديل MCP واعتماد الحساب؛ الوظائف غير المثبتة تعرض سببًا صريحًا. السجل القديم للقراءة ولا يرحل أو يحذف، والاستئناف بمعرف مختار. أحداث الأدوار المنتهية تنقضي بعد24ساعة أو بإخلاء الأقدم عند32MiB؛ المحادثات ومعرف الطلب محفوظة. عند50MiB يرفض الجديد دون حذف المحادثات.

WebView مقيد بالأصل والإطار الرئيس، وHMAC يسبق إرسال Bearer. Android ينشر الرمز الخاص في STDIN لأمر Termux ثابت؛ لا HTTP غير مصادق لتغييره، وملفات الاعتماد والخادم محجوبة عن واجهة الملفات. Accessibility يملك WS المحلي وسجل فعل دائم ومعرف لقطة؛ JSON محدود 1MiB. الصوت مالك واحد، وOTA يتحقق من الهوية والرقم والشهادة. minSdk24 وcompile/target34 باقية.

## تصحيح الهاتف

بعد غياب OpenSSL ثم aiohttp، ثبتت المتطلبات المعلنة؛ المستخدم أذن بتحديث فهارس apt دون ترقية عامة. الهاتف أثبت CRLF في Shell؛ صحح LF مع .gitattributes وفحص ZIP رجوعي. طلب المستخدم البحث في الويب والشفرة القديمة قبل تجربة أخرى؛ المصدر المطابق لـTermux 0.119.0-beta.3 أثبت إسقاط bash من env shebang، واختيارية exitCode عند فشل داخلي. صُحح RUN_COMMAND إلى Bash صريح مشتق من dataDir، والنتيجة حسب err ثم exitCode؛ الملخص حالة وأرقام فقط بلا stdout/stderr/errmsg.

نجح 1.3.2 على Samsung A55/API36: تشغيل الخادم من Companion بعد إغلاق Termux، health1.3.2/API1، HMAC وbootstrap، واجهة متصلة ومقترنة، tree ومعرف طلب ثابت، وJPEG صالح بقي داخل الهاتف. أعيد تمكين خدمة Companion والميكروفون بإذن صريح، وبقيت خدمات المستخدم الأخرى. أُذن بمسح بيانات Companion وحده؛ ملفات Termux واعتماد CLI لم تُمسح. settings.json بقي مطابق البصمة بعد التثبيت.

## الأدلة والباقي

42 فحص Python و14 فحص Android ناجحة؛ Node/Chromium للمراحل السابقة ناجحان، وblack79/flake8 للملفات الجديدة والمعدلة. بناء Release1.3.2 ناجح بالشهادة الأصلية؛ Lint صفر أخطاء و24 تحذيرًا. التثبيت الموقع والرجوع ورفض العبث مثبتان محليًا، والتثبيت والبدء والاقتران والشجرة واللقطة مثبتة على الهاتف. [قبول الهاتف](docs/phone-validation.md)، [التشخيص بالمصدر](docs/termux-phone-diagnosis.md)، [التحقق المحلي](docs/refactor-validation.md).

بقية القبول: إصلاح Back الجديد غير متحقق منه على الهاتف بطلب المستخدم؛ الإملاء غير محسوم ولا يعد عيبًا أو مانعًا بقراره. OTA من GitHub، ورفض أدوات CLI، وقبول شامل لقارئات الشاشة وأجهزة API24/API30 باقية. المحادثة والإلغاء والاستئناف والضغط والتمرير أثبتتها دورة السكربت على 1.3.2. لا تحذف assets القديمة قبل ذلك. لا أسرار CI مهيأة ولا نشر بعيد. المفتاح الأصلي محفوظ خاصًا خارج الملفات المعدة لـGit، لكنه باق في تاريخ Git القديم؛ لم يعد تشكيل التاريخ. أدوات البناء والنسخ والأدلة المحلية تحت .tmp المستبعدة. مرجع التشغيل SKILL.md والتثبيت docs/release-and-recovery.md.

## العمل الجاري

قبول الهاتف الآلي مأذون به: سكربت API داخل Termux وسكربت ADB على Windows؛ تقرير منقح محفوظ لكل فحص واستئناف دون إعادة دور مجهول. لا حقن نص يحسب إملاءً؛ اختبار الميكروفون يستعمل عبارة عربية مولدة محليًا بصوت Microsoft Hoda. الإصدار1.3.6/12 مثبت على الهاتف؛ لا قبول تفصيلي جديد.

## إصلاح الرجوع دون إعادة فحص

2026-10-05: مصدر Termux دل على اختصاري فتح القائمة وإغلاقها؛ استعملهما الفاحص بدل السحب، وTTY صريح لقراءة uiautomator في الذاكرة. نجحت سبعة فحوص حية للمحادثة وأفعال القائمة، وكشفت Back تغلق Activity. MainActivity يطلب الآن إغلاق آخر dialog من الأصل الموثوق، ويبقي سلوك Android المعتاد عند غيابها؛ ui.js يستعمل closeDialog ورد التركيز القائم. الصوت محفوظ فور كل فحص؛ تعذره مستثنى من عيوب التطبيق بقول المستخدم. لا فحوص جديدة بعد الأمر الصريح، ولا اتصال هاتف؛ المصدر والفاحص الجديدان غير متحقق منهما ميدانيًا.

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
