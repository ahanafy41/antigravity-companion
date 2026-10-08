#!/usr/bin/env bash
set -euo pipefail
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null || ! command -v openssl >/dev/null; then
    printf '%s\n' 'Install Python and OpenSSL in Termux before running this installer.' >&2
    exit 1
fi
exec python3 "$script_directory/scripts/install_release.py" "$@"
