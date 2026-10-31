#!/usr/bin/env bash
# ==============================================================================
# Antigravity Server Launcher (Port 7681)
# ==============================================================================
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
export HOME="/data/data/com.termux/files/home"
export GODEBUG="netdns=cgo"
export SSL_CERT_FILE="/data/data/com.termux/files/usr/etc/tls/cert.pem"
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"
unset LD_PRELOAD
SERVER_DIR="${COMPANION_HOME:-$HOME/.antigravity-server}"

mkdir -p "$SERVER_DIR"

# تفعيل قفل الاستيقاظ لمنع أندرويد من قتل السيرفر في الخلفية
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock 2>/dev/null || true
fi

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
    python3 -m zipfile -e "$UPDATE_ZIP" "$SERVER_DIR/" 2>/dev/null || unzip -o -q "$UPDATE_ZIP" -d "$SERVER_DIR/" 2>/dev/null || true
    rm -f /sdcard/Download/companion-server-update*.zip 2>/dev/null || true
    chmod +x "$SERVER_DIR/"*.sh 2>/dev/null || true
fi

pkill -9 -f "\.antigravity-server/server\.py" 2>/dev/null || true
fuser -k 7681/tcp 2>/dev/null || true
sleep 0.3

setsid -f python3 -B "$SERVER_DIR/server.py" --data-dir "$SERVER_DIR" --port 7681 ${1+"$@"} </dev/null > "$SERVER_DIR/server.log" 2>&1
sleep 1.0

if pgrep -f "\.antigravity-server/server\.py" >/dev/null; then
    echo "COMPANION_SERVER_PORT=7681"
    echo "[OK] Antigravity Server successfully running on port 7681."
else
    echo "[ERROR] Failed to start Antigravity Server."
fi
