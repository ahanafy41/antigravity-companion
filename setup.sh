#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Antigravity Companion - Universal Setup & Bootstrap Script
# إعداد وتثبيت خادم Antigravity وبيئة الذكاء الاصطناعي بالكامل في Termux
# ==============================================================================

set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive
export APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=1
export PATH="/data/data/com.termux/files/usr/bin:$PATH"

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
if command -v termux-reload-settings >/dev/null 2>&1; then
    termux-reload-settings 2>/dev/null || true
    echo "  -> تم تحديث إعدادات Termux فوراً (termux-reload-settings)."
fi
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock 2>/dev/null || true
    echo "  -> تم تفعيل قفل الاستيقاظ (termux-wake-lock) لحماية السيرفر من نوم الخلفية."
fi

# ── المرحلة 2: تحديث الحزم وتثبيت أدوات النظام الأساسية ────────────────────────
echo -e "\n${YELLOW}[2/5] جاري تحديث المستودعات وتثبيت الأدوات الأساسية (صامت)...${NC}"
pkg update -y -o Dpkg::Options::="--force-confnew" >/dev/null 2>&1 || true
pkg install -y python git curl openssl-tool unzip glibc-repo >/dev/null 2>&1 || true
pkg install -y glibc >/dev/null 2>&1 || true

# تثبيت متطلبات بايثون الأساسية للسيرفر
python3 -m pip install --upgrade aiohttp >/dev/null 2>&1 || pip install aiohttp >/dev/null 2>&1 || true
echo "  -> تم اكتمال تثبيت الأدوات الأساسية بنجاح."

# ── المرحلة 3: جلب وتجهيز ملفات السيرفر ─────────────────────────────────────────
echo -e "\n${YELLOW}[3/5] جاري تنزيل وتجهيز ملفات السيرفر...${NC}"
SERVER_DIR="$HOME/.antigravity-server"
REPO_DIR="$HOME/.antigravity-companion-repo"
mkdir -p "$SERVER_DIR"
mkdir -p "$HOME/.termux/tasker"

GITHUB_REPO="https://github.com/ahanafy41/antigravity-companion.git"

if [ -d "$REPO_DIR/.git" ]; then
    echo "  -> تحديث المستودع الحالي..."
    (cd "$REPO_DIR" && git fetch origin main 2>/dev/null && git reset --hard origin/main 2>/dev/null || git pull --rebase 2>/dev/null || true)
else
    echo "  -> استنساخ المستودع الكامل..."
    git clone --depth 1 "$GITHUB_REPO" "$REPO_DIR" 2>/dev/null || true
fi

if [ -d "$REPO_DIR/server" ]; then
    cp -rf "$REPO_DIR/server/"* "$SERVER_DIR/"
else
    # تنزيل الملفات الأساسية مباشرة في حال تعذر git clone
    GITHUB_RAW="https://raw.githubusercontent.com/ahanafy41/antigravity-companion/main"
    mkdir -p "$SERVER_DIR/web"
    for file in server.py application.py sessions.py storage.py security.py local_tasks.py voice_agent.py voice_planner.py task_runtime.py mcp_probe.py mcp_settings.py cli_client.py cli_settings.py cli_catalog.py auth_flow.py android_client.py legacy_conversations.py runtime_status.py launch_server.sh stop_server.sh sync_server.sh version.json conversation_metadata.py; do
        curl -fsSL --retry 3 --connect-timeout 10 "$GITHUB_RAW/server/$file" -o "$SERVER_DIR/$file" 2>/dev/null || true
    done
fi

chmod +x "$SERVER_DIR/launch_server.sh" "$SERVER_DIR/stop_server.sh" "$SERVER_DIR/sync_server.sh" 2>/dev/null || true

# عمل الروابط الرمزية للتوافق مع Termux RUN_COMMAND
ln -sf "$SERVER_DIR/launch_server.sh" "$HOME/launch_server.sh"
ln -sf "$SERVER_DIR/launch_server.sh" "$HOME/.termux/tasker/launch_server.sh"
ln -sf "$SERVER_DIR/stop_server.sh" "$HOME/stop_server.sh"
ln -sf "$SERVER_DIR/stop_server.sh" "$HOME/.termux/tasker/stop_server.sh"
ln -sf "$SERVER_DIR/sync_server.sh" "$HOME/sync_server.sh"
ln -sf "$SERVER_DIR/sync_server.sh" "$HOME/.termux/tasker/sync_server.sh"

echo "  -> تم تجهيز ملفات السيرفر في: $SERVER_DIR"

# ── إضافة التشغيل التلقائي للسيرفر في ~/.bashrc ─────────────────────────────────
BASHRC="$HOME/.bashrc"
AUTO_START_MARKER="# Antigravity Companion Server Auto-Start"
if ! grep -q "$AUTO_START_MARKER" "$BASHRC" 2>/dev/null; then
    echo "  -> ضبط التشغيل التلقائي للسيرفر عند فتح Termux..."
    cat << 'EOF' >> "$BASHRC"

# Antigravity Companion Server Auto-Start
if [ -f "$HOME/.antigravity-server/launch_server.sh" ] && ! pgrep -f "\.antigravity-server/server\.py" >/dev/null 2>&1; then
    bash "$HOME/.antigravity-server/launch_server.sh" >/dev/null 2>&1 &
fi
EOF
fi

# ── المرحلة 4: تشغيل السيرفر والتحقق من المنفذ 7681 ────────────────────────────
echo -e "\n${YELLOW}[4/5] جاري تشغيل خادم Antigravity والتحقق من المنفذ 7681...${NC}"
bash "$SERVER_DIR/stop_server.sh" >/dev/null 2>&1 || true
bash "$SERVER_DIR/launch_server.sh"
sleep 1.5

SERVER_ONLINE=false
for i in 1 2 3 4 5; do
    if curl -s -f http://127.0.0.1:7681/health >/dev/null 2>&1; then
        SERVER_ONLINE=true
        break
    fi
    sleep 1
done

if [ "$SERVER_ONLINE" = true ]; then
    echo -e "  ${GREEN}-> [PASS] خادم Antigravity يعمل الآن بنجاح على المنفذ 7681.${NC}"
else
    echo -e "  ${RED}-> [تحذير] السيرفر قيد البدء، يرجى مراجعة $SERVER_DIR/server.log عند الحاجة.${NC}"
fi

# ── المرحلة 5: التحقق من وجود أداة الذكاء الاصطناعي (agy) ────────────────────────
echo -e "\n${BLUE}====================================================${NC}"
echo -e "${GREEN}[5/5] المرحلة الأخيرة: فحص وكيل الذكاء الاصطناعي (agy)...${NC}"
echo -e "${BLUE}====================================================${NC}"

if ! command -v agy >/dev/null 2>&1; then
    echo -e "${YELLOW}جاري تثبيت أداة Antigravity CLI...${NC}"
    curl -fsSL https://raw.githubusercontent.com/wallentx/antigravity-cli-termux/dev/install.sh | bash || true
else
    echo -e "  ${GREEN}-> أداة agy مثبتة بالفعل.${NC}"
fi

echo -e "\n${GREEN}✓ اكتمل الإعداد بنجاح! يمكنك الآن الرجوع إلى تطبيق Antigravity Companion واستخدامه مباشرة.${NC}\n"
