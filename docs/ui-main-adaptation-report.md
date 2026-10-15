# feat: implement approved main UI and headless controls

2026-10-15 — complete_locally; field acceptance remains pending. This implements the four tasks in [the maintainer approval](https://github.com/ahanafy41/antigravity-companion/pull/1#issuecomment-6180568312). Source publication and the reply are explicitly authorized by the user.

## التنفيذ

| طلب المطور | ما تغيّر | دليل الفحص المحلي |
|---|---|---|
| الصوت الخفي | VoiceCommandActivity يسلم النص إلى FloatingVoiceController وينتهي دون فتح MainActivity. الأمر في عامل خلفي مملوك، والنطق من NativeSpeech القائم بـar-EG. الإملاء يملأ المحرر المفتوح دون إرسال. cwd من إعدادات المستخدم؛ إلغاء الطلب المجهول بمعرّفه، ثم غلق الجلسة الخاصة. | Android compile و3 فحوص JVM للصوت: اكتمال دون نطق مكرر، POST مجهول، إلغاء يحفظ interruption؛ وفحص Chromium للإملاء دون إرسال. |
| loopback على 8765 | WebSocket يثق بعنوان peer الحقيقي المحلي دون Bearer؛ يرفض غير loopback والأصل الأجنبي. بقي الربط على 127.0.0.1 وعقد journal_ready_epoch_v1 وسجل الأفعال. | فحوص AutomationConnectionPolicy، مع بناء Android. |
| واجهة main | استيراد index/start من upstream/main@05470d668e3c846104dbed2f214c27f202d69b4e، وفصل CSS/JS محليًا تحت CSP القائم. DynamicSettingsEngine يبقي select/switch/chips، وgetToolLabel يبقي تفاصيل الأدوات وإعلانها ونغماتها. | Chromium مع المواءمة الحقيقية وHTTP v1 تجريبي: البدء وCSP، حفظ حقول التغيير وحدها، revision/409، صون deny/ask، خيارات / و@ ومسار ذي فراغ، HTML غير موثوق، OAuth دون كشف السر، إملاء بلا إرسال، استعادة السجل والقراءة دون شبكة وصفحة البدء. |
| الجسر والإيقاف | استدعاءات قديمة غير متزامنة فوق CompanionNative الحالي. أفعال إعدادات الوصول وTermux ونسخ أمر الإعداد والتشخيص والنسخ والترقية موصولة. POST /api/v1/system/shutdown يرد 202 stopping، ثم يغلق server.py نفسه وموارده. | فحوص NativeActionArguments و53 JVM إجمالًا؛ 6 فحوص shutdown تشمل Cookie/CSRF/Origin وعدم التكرار والخادم المضمّن، وعملية خادم حقيقية خرجت بالرمز 0. |

## العقود المصونة

- لا تعديل لـfetch العام، ولا API قديمة موازية على الخادم. main-v1-adapter.js يستعمل api.js/native.js/history.js؛ كل تغيير يمر بـCSRF.
- إنشاء الأدوار يستعمل /sessions/{id}/runs مع client_request_id. تحفظ هوية POST المجهول؛ اختلاف النص يرفض قبل أثر جديد. يعاد GET للبث مرة مع Last-Event-ID، وتقرأ snapshot عند انقطاعه؛ لا تعاد العملية لمجرد انقطاع البث.
- الرسالة أثناء دور جارٍ تحفظ queued للدور التالي؛ لا يدّعى حقنها في الدور الجاري. هوية الرسالة التالية وترقية CLI محفوظة عند غموض النتيجة.
- حفظ settings يرسل الحقول المعدلة مع If-Match. whitelist/command(*) عبر /cli/policy مع revision وصون deny/ask. الأذون التي لا يجيزها العقد معطلة مع بيان السبب؛ الحقول المجهولة لا يعاد بناؤها أو محوها.
- ملفات MCP تتبع مالكها وcwd وrevision. محرر OAuth لا يسترجع السر؛ الفارغ يحفظه والمحو صريح. المصادقة في طرفية agy؛ فتحها لا يثبت نجاح الدخول. فهرس MCP الأصلي محفوظ، ومسار Filesystem يؤخذ من مجلد العمل المختار.
- Native update يستعمل الحزمة التي تحقق منها Android؛ لا يختار رابط JavaScript ملف APK. تبقى Origin والإطار الرئيس وإثبات HMAC.
- / و/start هما المدخلان النشطان. SW يحفظ أصولهما وحدها ولا يحفظ API. repair.html الأصلي باقٍ عند غياب الخادم؛ لا تستطيع صفحة يخدمها الخادم إصلاح غيابه.
- أزيل شرط update --help غير اللازم: إعلان update في المساعدة الرئيسة وفحص النسخة وسجل الطلب ورفض الترقية أثناء العمل باقية. أثبت الفحص الإخفاق قبل الإصلاح ثم نجاح الترقية مرة واحدة بعده. النسخة unchanged لا تعرض على أنها ترقية حدثت.

## التحقق

- 199 فحص Python ناجح، ومنها عملية shutdown حقيقية وفحص الترقية الرجعي.
- 53 فحص JVM، صفر إخفاق وصفر خطأ؛ Debug مبني.
- فحص Chromium الجديد يستعمل المواءمة الإنتاجية، لا بديلًا صوريًا لها. حدود المحاكاة: CLI والشبكة الخارجية وAndroid؛ نجاحه لا يثبت قبولها حيًا.
- فحصا Node للمكونات المشتركة والعقود القائمة، وصياغة JavaScript، وBlack79 وflake8 وبصمة SW وgit diff --check.
- طوبق 50 أصلًا للخادم وصفحة repair.html داخل Debug بالمصدر بايتًا بايتًا. تقرير البناء المحلي تحت app/build؛ لا إضافة لمفاتيح توقيع أو APK إلى Git.

## ما يحتاج قبول المطور الميداني

1. TalkBack وJieshuo/CSR: ترتيب القراءة وTab والتركيز والرجوع والإعلانات، على الهاتف الفعلي.
2. أمر صوتي حقيقي مع بقاء التطبيق الحالي ونطق ar-EG، والإلغاء أثناء عمل الجهاز.
3. أداة /usr/bin/phone المثبتة: لا يوجد مصدرها في الشجرة الحالية؛ الإصلاح يستهدف WebSocket الفعلي، ولا يخترع HTTP serve.
4. حساب agy ومصادقة MCP وترقية APK وTermux الحية. لم تُنفذ ترقية CLI المثبت أو تنزيل APK فعلي أثناء الفحص.

لا يعني complete_locally قبولًا نهائيًا للدمج. لا متعهدات cron أو محرك مزودين مستقل أو قاعدة سحابية أو اعتماد جديد ضمن هذا العمل.
