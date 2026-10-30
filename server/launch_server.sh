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

UPDATE_ZIP="/sdcard/Download/companion-server-update.zip"
if [ -f "$UPDATE_ZIP" ]; then
    python3 -m zipfile -e "$UPDATE_ZIP" "$SERVER_DIR/" 2>/dev/null || unzip -o -q "$UPDATE_ZIP" -d "$SERVER_DIR/" 2>/dev/null || true
    rm -f "$UPDATE_ZIP" 2>/dev/null || true
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
