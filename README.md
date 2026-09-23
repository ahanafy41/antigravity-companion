# Antigravity Companion & Automation Bridge

> **تطبيق الأندرويد المستقل ومحرك الأتمتة وإمكانية الوصول لمساعد Antigravity**

---

## 🌟 نظرة عامة (Overview)

**Antigravity Companion** هو تطبيق أندرويد متكامل ومستقل يحل مشكلة الـ Single-Thread في قارئات الشاشة (مثل Jieshuo/CSR) حلاً جذرياً، من خلال:
1. **واجهة استخدام مدمجة (Accessible WebView Dashboard)**: متوافقة 100% مع معايير إمكانية الوصول W3C WAI-ARIA و TalkBack وقارئ الشاشة الصيني Jieshuo.
2. **خدمة إمكانية وصول مستقلة (Dedicated AccessibilityService)**: تعمل في عملية (Process) وثريدات مستقلة تماماً للتحكم في الشاشة، قراءة شجرة العناصر، النقر، السحب، والتقاط الشاشة دون أي بطء أو تعطيل لنطق الهاتف.
3. **خادم ويب سوكت محلي (Local WebSocket Bridge)**: على العنوان المحلي `127.0.0.1:8765` للربط اللحظي ثنائي الاتجاه بين وكلاء الذكاء الاصطناعي في Termux وواجهة الهاتف.
4. **تشغيل ذاتي صامت (Zero-Friction Termux Auto-Start)**: إيقاظ خادم بايثون في خلفية تيرمكس تلقائياً عبر `com.termux.RUN_COMMAND` بدون فتح الشاشة السوداء أو إدخال أوامر يدوية.

---

## 🚀 طريقة بناء وتنزيل الـ APK عبر GitHub Actions (بدون تثبيت أدوات على الموبايل)

تم إعداد المشروع بمسار **GitHub Actions CI/CD** مسبقاً، بحيث يتم بناء ملف الـ APK في السحابة وتنزيله جاهزاً:

### 1. رفع المشروع إلى مستودع جديد على حسابك في GitHub:
من داخل تيرمكس:
```bash
cd /data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app
git init
git add .
git commit -m "feat: initial release of Antigravity Companion Android app"
git branch -M main
# أنشئ مستودعاً جديداً على حسابك باسم antigravity-companion ثم اربطه:
git remote add origin https://github.com/ahanafy41/antigravity-companion.git
git push -u origin main
```

### 2. تنزيل الـ APK:
- بمجرد الرفع، توجه إلى تبويب **Actions** في مستودع GitHub.
- ستجد مهمة **Assemble Android APK** قد بدأت وانتهت بنجاح في أقل من دقيقتين.
- ستجد ملف `AntigravityCompanion-Debug-APK` متاحاً للتنزيل والتثبيت مباشرة على هاتفك!

---

## ⚙️ التثبيت والاستخدام لأول مرة

1. قم بتثبيت ملف الـ `app-debug.apk` على هاتفك.
2. افتح إعدادات الهاتف -> **إمكانية الوصول (Accessibility)**.
3. ابحث عن خدمة **Antigravity AI Automation** وقم بتفعيلها.
4. (اختياري للتشغيل الصامت الكامل): تأكد من وجود السطر التالي في ملف `~/.termux/termux.properties`:
   ```properties
   allow-external-apps = true
   ```
5. افتح تطبيق **Antigravity Companion** واستمتع بتحكم فوري وتواصل سلس مع الذكاء الاصطناعي!

---

## 🩺 الفحص الذاتي (Doctor)
يمكنك فحص سلامة الربط في أي وقت من تيرمكس عبر:
```bash
python3 scripts/doctor.py --doctor
```
