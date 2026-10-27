# حصيلة إصلاح نتائج المراجعة

2026-10-08 — fix: address local review findings.

أُصلح عيبا التطبيق المثبتان: إلغاء ترقية APK صار محفوظًا لكل تنزيل، ويمنع نشر النتيجة وتسليمها وفتح المثبت بعد الإلغاء؛ وlauncher يعلن منفذ الخادم بعد نجاح التشغيل، فيتحقق التطبيق من HMAC قبل حفظه وتقييد WebView والجسر به. إعداد settings.json لا يُستبدل، ومخرجات Termux الخام لا تنتقل إلى الويب.

أُصلحت مآخذ Black79 وflake8 في server وscripts، بما فيها doctor وphone_acceptance؛ لم يُشغّل فاحص الهاتف. صُحّح وصف اعتماد خطة التكافؤ في SKILL.md، وجُدّدت حزمة المصدر وجردها دون تغيير هوية إصدار الإنتاج 1.3.6/12 أو إنشاء ترقية موقعة.

| الفحص | الحصيلة |
|---|---|
| Python: backend / parity / launcher / release / phase1 | 49 / 9 / 5 / 8 / 8؛ المجموع 79، بلا إخفاق |
| JVM | 35، صفر failures/errors/skipped |
| Android Lint | صفر أخطاء؛ 24 ملحوظة سابقة |
| assembleDebug offline | ناجح |
| Black79 / flake8: server وscripts | ناجحان؛ 24 ملف Python |
| Node run_tests.cjs وSW --check | ناجحان |
| APK assets والمصدر | تطابق حرفي؛ 39 ملف خادم واعتماد ومثبت، وrepair.html |
| حزمة المصدر والجرد | 51 ملفًا؛ SHA256 ومطابقة المصدر وصياغة Python |

فحص المنفذ أخفق قبل الإصلاح ثم نجح؛ يثبت حفظ المنفذ والحقول المجهولة وعدم إعلان نجاح عند إخفاق التشغيل. فحوص JVM تغطي الإلغاء أثناء التحقق وقبل تسليم النتيجة واستقلال الطلبين، وترفض منفذًا خارج الحدود أو مكررًا أو نصًا مفرطًا أو نتيجة تشغيل فاشلة. لم يُختبر تسليم نتيجة Termux أو فتح المثبت على هاتف؛ فحوص الإلغاء تستعمل حدود التنفيذ المشتركة الخالية من Android.

ملحوظات Lint: RequiresFeature=2، UnusedAttribute=1، RedundantLabel=1، DataExtractionRules=1، StaticFieldLeak=2، UnusedResources=10، TypographyEllipsis=1، SetTextI18n=6. ليست الحصيلة شهادة خلو كامل الشفرة من العيوب، ولا إثباتًا للتكافؤ غير المكتمل في task.md. أدلة الفحص تحت .tmp/review-fixes، وAPK تحت app/build/outputs/apk/debug/app-debug.apk، وهو بناء تطوير لم يُثبت أو يُنشر. لا هاتف أو متصفح أو حساب حي أو commit جديد في هذه المهمة.
