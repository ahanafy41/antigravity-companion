#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Antigravity Server Auto-Launcher (Hidden Server Edition)
# ==============================================================================
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
export HOME="/data/data/com.termux/files/home"
SERVER_DIR="$HOME/.antigravity-server"

mkdir -p "$SERVER_DIR"

# Check if port 7681 is actively listening
if ! (echo > /dev/tcp/127.0.0.1/7681) 2>/dev/null; then
    echo "[$(date)] Port 7681 not detected. Starting server.py..." >> "$SERVER_DIR/server_launcher.log"
    nohup python3 "$SERVER_DIR/server.py" > "$SERVER_DIR/server.log" 2>&1 &
    sleep 1
    if (echo > /dev/tcp/127.0.0.1/7681) 2>/dev/null; then
        echo "[$(date)] server.py successfully started and listening on 7681." >> "$SERVER_DIR/server_launcher.log"
    else
        echo "[$(date)] Server launched; awaiting port 7681 listener." >> "$SERVER_DIR/server_launcher.log"
    fi
else
    echo "[$(date)] server.py is already running on port 7681." >> "$SERVER_DIR/server_launcher.log"
fi
