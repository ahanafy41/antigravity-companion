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

# 1. Capture android_token from STDIN if provided by Termux RUN_COMMAND
if [ ! -t 0 ]; then
    read -t 1 -r STDIN_DATA || true
    if [ -n "$STDIN_DATA" ] && [[ "$STDIN_DATA" =~ android_token ]]; then
        echo "$STDIN_DATA" > "$SERVER_DIR/android.json" 2>/dev/null || true
        chmod 600 "$SERVER_DIR/android.json" 2>/dev/null || true
    fi
fi

# 2. Check for offline update package if present
UPDATE_ZIP=""
for z in /sdcard/Download/companion-server-update*.zip; do
    if [ -f "$z" ]; then
        UPDATE_ZIP="$z"
        break
    fi
done

if [ -n "$UPDATE_ZIP" ]; then
    echo "[SYNC] Found offline server package from companion app. Installing into $SERVER_DIR..."
    python3 -m zipfile -e "$UPDATE_ZIP" "$SERVER_DIR/" 2>/dev/null || unzip -o -q "$UPDATE_ZIP" -d "$SERVER_DIR/" 2>/dev/null || true
    rm -f /sdcard/Download/companion-server-update*.zip 2>/dev/null || true
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
