#!/usr/bin/env bash
# ==============================================================================
# Antigravity Server Stopper (Port 7681)
# ==============================================================================
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
export HOME="/data/data/com.termux/files/home"
SERVER_DIR="${COMPANION_HOME:-$HOME/.antigravity-server}"
PID_FILE="$SERVER_DIR/server.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        kill "$PID" 2>/dev/null || true
        for i in 1 2 3 4 5; do
            if ! kill -0 "$PID" 2>/dev/null; then
                break
            fi
            sleep 0.2
        done
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" 2>/dev/null || true
        fi
    fi
    rm -f "$PID_FILE"
fi

pkill -9 -f "\.antigravity-server/server\.py" 2>/dev/null || true
fuser -k 7681/tcp 2>/dev/null || true
echo "[OK] Antigravity Server stopped successfully."
