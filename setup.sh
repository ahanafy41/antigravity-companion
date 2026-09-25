#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Antigravity Companion - Universal Zero-Friction Setup Script
# إعداد وتثبيت خادم Antigravity وبيئة الذكاء الاصطناعي بالكامل في Termux
# ==============================================================================

set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive
export APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=1

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}   بدء التجهيز التلقائي الشامل لـ Antigravity Companion   ${NC}"
echo -e "${BLUE}====================================================${NC}"

# ── المرحلة 1: ضبط أمان Termux وصلاحيات التطبيقات الخارجية ──────────────────────
echo -e "\n${YELLOW}[1/5] ضبط إعدادات الأمان واستقبال الأوامر الخارجية في Termux...${NC}"
mkdir -p "$HOME/.termux"
if ! grep -q "allow-external-apps=true" "$HOME/.termux/termux.properties" 2>/dev/null; then
    echo "allow-external-apps=true" >> "$HOME/.termux/termux.properties"
    echo "  -> تم تفعيل allow-external-apps بنجاح."
else
    echo "  -> خاصية allow-external-apps مفعلة بالفعل."
fi

# ── المرحلة 2: تحديث الحزم وتثبيت أدوات النظام الأساسية ────────────────────────
echo -e "\n${YELLOW}[2/5] جاري تحديث المستودعات وتثبيت الأدوات الأساسية (صامت)...${NC}"
pkg update -y -o Dpkg::Options::="--force-confnew" >/dev/null 2>&1 || true
pkg upgrade -y -o Dpkg::Options::="--force-confnew" >/dev/null 2>&1 || true
pkg install -y git curl python ttyd glibc-repo >/dev/null 2>&1 || true
pkg update -y >/dev/null 2>&1 || true
pkg install -y glibc >/dev/null 2>&1 || true
echo "  -> تم اكتمال تثبيت الحزم بنجاح."

# ── المرحلة 3: إنشاء المجلد المخفي وتنزيل ملفات السيرفر ─────────────────────────
echo -e "\n${YELLOW}[3/5] جاري إنشاء المجلد المحمي وتجهيز ملفات السيرفر...${NC}"
SERVER_DIR="$HOME/.antigravity-server"
mkdir -p "$SERVER_DIR/web"
mkdir -p "$HOME/.termux/tasker"

GITHUB_RAW="https://raw.githubusercontent.com/ahanafy41/antigravity-companion/main"

# تنزيل ملفات السيرفر مع إعادة المحاولة التلقائية
curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/server.py" -o "$SERVER_DIR/server.py"
curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/launch_server.sh" -o "$SERVER_DIR/launch_server.sh"
chmod +x "$SERVER_DIR/launch_server.sh"

# تنزيل ملفات واجهة الويب
curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/web/index.html" -o "$SERVER_DIR/web/index.html"
curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/web/manifest.json" -o "$SERVER_DIR/web/manifest.json" 2>/dev/null || true
curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/web/icon.svg" -o "$SERVER_DIR/web/icon.svg" 2>/dev/null || true
curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/web/sw.js" -o "$SERVER_DIR/web/sw.js" 2>/dev/null || true

# عمل روابط للمسارات لضمان التوافق مع Termux RUN_COMMAND
ln -sf "$SERVER_DIR/launch_server.sh" "$HOME/launch_server.sh"
ln -sf "$SERVER_DIR/launch_server.sh" "$HOME/.termux/tasker/launch_server.sh"

# فحص سلامة كود بايثون
python3 -m py_compile "$SERVER_DIR/server.py"
echo "  -> تم حفظ وفحص ملفات السيرفر بنجاح في: $SERVER_DIR"

# ── المرحلة 4: تشغيل السيرفر والتحقق من البورت 7681 ────────────────────────────
echo -e "\n${YELLOW}[4/5] جاري تشغيل خادم Antigravity والتحقق من المنفذ 7681...${NC}"
pkill -f "python3.*server.py" 2>/dev/null || true
bash "$SERVER_DIR/launch_server.sh"
sleep 1.5

if (echo > /dev/tcp/127.0.0.1/7681) 2>/dev/null; then
    echo -e "  ${GREEN}-> [PASS] خادم Antigravity يعمل الآن بنجاح على المنفذ 7681.${NC}"
else
    echo -e "  ${YELLOW}-> جاري الانتظار ثانية إضافية لاستقرار الخادم...${NC}"
    sleep 2
    if (echo > /dev/tcp/127.0.0.1/7681) 2>/dev/null; then
        echo -e "  ${GREEN}-> [PASS] خادم Antigravity يعمل الآن بنجاح على المنفذ 7681.${NC}"
    else
        echo -e "  ${RED}-> [تحذير] السيرفر قيد البدء، يرجى مراجعة $SERVER_DIR/server.log عند الحاجة.${NC}"
    fi
fi

# ── المرحلة 5 (الخاتمة): تثبيت وكيل الذكاء الاصطناعي وتسجيل الدخول ───────────────
echo -e "\n${BLUE}====================================================${NC}"
echo -e "${GREEN}[5/5] المرحلة الأخيرة: تثبيت وكيل الذكاء الاصطناعي (agy)...${NC}"
echo -e "${YELLOW}بعد قليل ستظهر شاشة تسجيل الدخول؛ يرجى تسجيل الدخول لإنهاء الإعداد.${NC}"
echo -e "${BLUE}====================================================${NC}\n"

curl -fsSL https://raw.githubusercontent.com/wallentx/antigravity-cli-termux/dev/install.sh | bash
