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

pkill -9 -f "\.antigravity-server/server\.py" 2>/dev/null || true
fuser -k 7681/tcp 2>/dev/null || true
sleep 0.3

setsid -f python3 -B "$SERVER_DIR/server.py" --data-dir "$SERVER_DIR" --port 7681 "$@" </dev/null > "$SERVER_DIR/server.log" 2>&1
sleep 1.0

if pgrep -f "\.antigravity-server/server\.py" >/dev/null; then
    echo "COMPANION_SERVER_PORT=7681"
    echo "✓ Antigravity Server successfully running on port 7681."
else
    echo "✗ Failed to start Antigravity Server."
fi
