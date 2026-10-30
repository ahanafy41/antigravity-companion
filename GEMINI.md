# Antigravity Companion Developer Invariants

## Permanent Release Keystore Invariant (قاعدة المفتاح الدائم الإلزامية)
- **المفتاح الدائم الإلزامي**: المسار الثابت للمفتاح هو `app/keystore/antigravity-release-key.jks`.
- **معلومات التوقيع الثابتة**:
  - `Key Alias`: `antigravity`
  - `Store Password / Key Password`: `antigravity2026`
  - `Store Type`: `PKCS12`
  - `Certificate SHA256 Fingerprint`: `34:8B:F2:A7:AF:8F:14:E5:EC:2D:05:28:A7:03:BD:16:45:04:9D:6B:12:05:E1:F6:CC:7B:65:30:F9:43:5D:DB`
  - `Certificate Serial Number`: `66ebb7a332c9556e3dfd2a209efe69d114761a54`
- **حظر صارم (Strict Invariant)**:
  - يُحظر تماماً تحت أي ظرف توليد مفتاح توقيع جديد، أو تعديل مسار المفتاح، أو استبدال ملف `app/keystore/antigravity-release-key.jks`.
  - كل الحزم المصدرة للإنتاج (Production/Release) عبر GitHub Actions أو Gradle يجب أن تُوقع حصراً بهذا المفتاح لضمان استمرارية التحديث التلقائي (OTA In-App Updates) دون الحاجة لإلغاء تثبيت التطبيق أبداً.
