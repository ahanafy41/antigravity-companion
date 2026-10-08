#!/usr/bin/env bash
set -euo pipefail
server_root="${COMPANION_HOME:-$HOME/.antigravity-server}"
exec python3 "$server_root/launcher.py" --root "$server_root" "$@"
