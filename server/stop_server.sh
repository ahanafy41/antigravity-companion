#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Antigravity Server Stopper
# إيقاف خادم Antigravity وإنهاء العمليات نهائياً
# ==============================================================================
export PATH="/data/data/com.termux/files/usr/bin:$PATH"
pkill -9 -f "server.py" 2>/dev/null || true
pkill -9 -f "antigravity-server" 2>/dev/null || true
