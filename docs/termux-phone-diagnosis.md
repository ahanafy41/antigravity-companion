# تشخيص إقلاع Termux على الهاتف

التاريخ: 2026-10-04. النطاق: بحث المصادر ومقابلة الشفرة القديمة؛ لا أوامر هاتف ولا تعديل إنتاج في هذا البحث. الإصدار المقابل: Termux `v0.119.0-beta.3` كما عيّنه فحص الهاتف، لا `master` وحده. استُعملت مهارة research.

## ما أثبته فحص الهاتف السابق

أثبت الفحص السابق هذه الوقائع: Samsung A55 يعمل بـAPI36؛ الحزمة 1.3.1 مثبتة؛ إذن RUN_COMMAND ممنوح و`allow-external-apps=true`. أخفق launcher أولاً بـexit127 لأن shebang احتوى CRLF فطلب `bash\r`. بعد LF نجح تشغيل launcher المثبت مباشرة، وأعاد `/health` الإصدار 1.3.1 وAPI1. أما مسار التطبيق native فلم ينشئ `android.json`، وعرض الاقتران اليدوي. هذه وقائع الفحص السابق، لا نتائج تجربة جديدة في هذا البحث. صحة health لا تثبت نقل stdin أو وصول callback.

## مقابلة الشفرة القديمة

النسخة المحفوظة في `.tmp/original-production/server/launch_server.sh` تبدأ بـ`#!/data/data/com.termux/files/usr/bin/bash`، وتعين PATH وHOME صراحة، ثم تشغّل `server.py` بعد فحص المنفذ. launcher الحالي يبدأ بـ`#!/usr/bin/env bash` ويفوّض `launcher.py`. إذن تبدّل شكل المفسر أثناء إعادة البناء؛ الأمر القديم لا يعتمد على وسيطة shebang ثانية.

وفي `.tmp/original-production/app/src/main/java/com/antigravity/companion/TermuxBridge.java` يُرسل ملف shell نفسه في RUN_COMMAND_PATH، وarguments فارغة، وbackground=true؛ ليست الشفرة القديمة شاهداً على نجاح shebang الجديد. كذلك كانت تقرأ `result_code/result_stdout/result_stderr` من جذر Intent وتفترض exitCode=0 عند غيابه؛ ذلك يخالف عقد النتيجة الفعلي، فلا تُستعاد تلك القراءة. لم يُثبت هذا البحث نجاح التطبيق القديم على الهاتف.

## المثبت من المصدر المطابق للإصدار

1. يفصل `TermuxShellUtils.setupShellCommandArguments` المفسر عند أول مسافة أو LF. وعند `/usr/bin/env` يعيد كتابة المسار إلى `$PREFIX/bin/env`؛ لا يحتفظ بالكلمة `bash` التالية. بناء الأمر الحالي لذلك هو `env, launch_server.sh, --android-token-stdin`. تقرأ الشفرة أول 256 بايت، ثم تضيف executable وarguments إلى القائمة. تحققنا من نص الوسم نفسه عبر HTTPS؛ تعذّر قارئ web أولاً، فاستُعمل Invoke-WebRequest قراءةً فقط. [TermuxShellUtils، الوسم v0.119.0-beta.3](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/termux-shared/src/main/java/com/termux/shared/termux/shell/TermuxShellUtils.java#L30-L81).
2. يستخدم `AppShell` القائمة الناتجة في `Runtime.exec` للخلفية. اختلاف القائمة عن تنفيذ جلسة shell مثبت؛ أما كونه السبب الوحيد لفشل الهاتف فلا يثبت دون stderr أو إعادة قبول مأذونة بعد الإصلاح. [AppShell، الوسم نفسه](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/termux-shared/src/main/java/com/termux/shared/shell/command/runner/app/AppShell.java).
3. يحوّل `RunCommandService` executable وworkdir إلى canonical، ويفحص الملف وصلاحياته قبل التنفيذ. ويصف `TermuxFileUtils` الربط بين `/data/data` و`/data/user/0` على Android≥11. اختلاف اللفظ وحده لا يثبت أن dataDir هو سبب العطل. [RunCommandService](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/app/src/main/java/com/termux/app/RunCommandService.java#L140-L167)، [TermuxFileUtils](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/termux-shared/src/main/java/com/termux/shared/termux/file/TermuxFileUtils.java).
4. يحوي الرد Bundle باسم `result` ومفاتيح `stdout/stderr/exitCode/err/errmsg`. يضع `ResultSender` exitCode إذا لم يكن null فقط؛ ويضع err دائماً. لذلك فشل ما قبل العملية قد يأتي بلا exitCode، ولا يصح وصفه بمجرد ذلك بأنه malformed. receiver الحالي يشترط الحقلين فيحجب errmsg؛ هذا عيب تشخيص مستقل، لا سبب غياب الملف. [الثوابت](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/termux-shared/src/main/java/com/termux/shared/termux/TermuxConstants.java)، [ResultSender](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/termux-shared/src/main/java/com/termux/shared/shell/command/result/ResultSender.java#L109-L121).
5. يرسل ResultSender Intent جديداً يضيف Bundle فقط؛ لا يحدد action أو data بديلين. لا يثبت منه تعارض مع nonce في `companion-result://launch/<nonce>`؛ موضع nonce هو آخر جزء من المسار، وPendingIntent الأصلي explicit وmutable وone-shot. [ResultSender](https://github.com/termux/termux-app/blob/v0.119.0-beta.3/termux-shared/src/main/java/com/termux/shared/shell/command/result/ResultSender.java#L118-L124)، [دليل RUN_COMMAND الرسمي](https://github.com/termux/termux-app/wiki/RUN_COMMAND-Intent).

## الإصلاح المقترح وقبول ما بعده

المقترح الأول: جعل RUN_COMMAND_PATH مفسر bash الثابت المشتق من `applicationInfo.dataDir + /files/usr/bin/bash`، وarguments قائمة ثابتة تحوي launcher المعروف ثم `--android-token-stdin`. تبقى البيانات في stdin، ولا `bash -c` ولا shell عام ولا مسار يختاره JavaScript. هذا يتجاوز تفسير shebang بواسطة Termux ويحفظ استقلال ملفات Python. هو مقترح لم يُطبق في هذا البحث.

المقترح الثاني: قراءة err أولاً؛ الخطأ الداخلي يعاد failed مع errmsg، ولو غاب exitCode. ومع err=-1 يلزم exitCode صالح لإثبات finished؛ غيابه outcome_unknown. لا يُنشأ exitCode=0 افتراضاً، ولا تكشف محتويات stdin أو رمز المصادقة في التقرير.

بعد نجاح فحوص العقد والمراجعة والبناء يُستأنف فحص واحد محصور ضمن إذن التجربة السابق: إرسال launcher من Activity أمامية، ثم إثبات callback finished ووجود android.json دون عرض محتواه، ثم HMAC/bootstrap وعودة الواجهة المصادقة. طلب المستخدم البحث في الويب والشفرة القديمة والتثبت قبل أي فعل جديد على الهاتف؛ لا تُستأنف التجربة قبل إتمام ذلك.

## الإثبات المحلي والإصلاح الجاري

استُخرج setupShellCommandArguments نفسه من المصدر الموسوم وشُغّل محليًا في Java17: أعاد env والملف والعلم دون bash؛ ومع مفسر ELF صريح حفظ ترتيب المفسر والملف والعلم. فحص LF قرأ ZIP المصنوع وفشل قبل الإصلاح ونجح بعده. عقد argv والنتيجة له 3 فحوص JUnit جديدة، نجحت مع 11 فحصًا قائمًا. الإصلاح الجاري 1.3.2/8 يختار Bash مباشرة ويصنف err قبل exitCode، ويعرض حالة وأرقامًا ثابتة دون stdout/stderr/errmsg. كان هذا وصف الحال قبل فحص القبول؛ أثبت الفحص اللاحق بدء 1.3.2 والاقتران والشجرة واللقطة على الهاتف. الحصيلة وحدودها في [قبول الهاتف](phone-validation.md).
