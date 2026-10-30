#!/usr/bin/env bash
# ==============================================================================
# Antigravity Server Sync & Deployer (Offline / Online Auto-Updater)
# مزامنة ونقل ملفات خادم Antigravity تلقائياً من التطبيق أو المستودع
# ==============================================================================
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
export HOME="/data/data/com.termux/files/home"
SERVER_DIR="${COMPANION_HOME:-$HOME/.antigravity-server}"
REPO_DIR="$HOME/.antigravity-companion-repo"

mkdir -p "$SERVER_DIR"

UPDATE_ZIP="/sdcard/Download/companion-server-update.zip"

if [ -f "$UPDATE_ZIP" ]; then
    echo "[SYNC] Found offline server package from companion app. Installing into $SERVER_DIR..."
    python3 -m zipfile -e "$UPDATE_ZIP" "$SERVER_DIR/" 2>/dev/null || unzip -o -q "$UPDATE_ZIP" -d "$SERVER_DIR/" 2>/dev/null || true
    rm -f "$UPDATE_ZIP" 2>/dev/null || true
    chmod +x "$SERVER_DIR/"*.sh 2>/dev/null || true
    echo "[SYNC] Offline package installed successfully."
elif [ -d "$REPO_DIR/.git" ]; then
    echo "[SYNC] Syncing from local git repository..."
    (cd "$REPO_DIR" && git pull --rebase 2>/dev/null || true)
    if [ -d "$REPO_DIR/server" ]; then
        cp -rf "$REPO_DIR/server/"* "$SERVER_DIR/"
        chmod +x "$SERVER_DIR/"*.sh 2>/dev/null || true
        echo "[SYNC] Repository synced successfully."
    fi
fi

# ضبط الصلاحيات وإعادة تشغيل السيرفر
chmod +x "$SERVER_DIR/launch_server.sh" "$SERVER_DIR/stop_server.sh" "$SERVER_DIR/sync_server.sh" 2>/dev/null || true
bash "$SERVER_DIR/stop_server.sh" >/dev/null 2>&1 || true
sleep 0.5
bash "$SERVER_DIR/launch_server.sh"
