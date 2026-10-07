#!/usr/bin/env python3
# ==============================================================================
# Termux Accessible Web - Models Registry, Reasoning Effort & Quota
# ==============================================================================

import os
import sys
import time
import re
import subprocess
import threading

SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from shared import AUTH_TOKEN_FILE, get_agy_binary_path, send_json_response, logger

def is_effort_supported_for_model(model_name: str) -> bool:
    if not model_name:
        return False
    m = model_name.lower().strip()
    if "claude" in m:
        return False
    if "thinking" in m:
        return False
    if any(m.endswith(suffix) for suffix in ["-low", "-medium", "-high", "-max"]):
        return False
    return True

# Fallback default models if offline / CLI unavailable (Clean English verbatim names, no injected tags)
DEFAULT_MODELS = [
    {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High)"},
    {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium)"},
    {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low)"},
    {"id": "gemini-3.7-flash-high", "name": "Gemini 3.7 Flash (High)"},
    {"id": "gemini-3.7-flash-medium", "name": "Gemini 3.7 Flash (Medium)"},
    {"id": "gemini-3.7-flash-low", "name": "Gemini 3.7 Flash (Low)"},
    {"id": "gemini-3.6-flash-high", "name": "Gemini 3.6 Flash (High)"},
    {"id": "gemini-3.6-flash-medium", "name": "Gemini 3.6 Flash (Medium)"},
    {"id": "gemini-3.6-flash-low", "name": "Gemini 3.6 Flash (Low)"},
    {"id": "gemini-3.1-pro-high", "name": "Gemini 3.1 Pro (High)"},
    {"id": "gemini-3.1-pro-low", "name": "Gemini 3.1 Pro (Low)"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6 (Thinking)"},
    {"id": "claude-opus-4-6-thinking", "name": "Claude Opus 4.6 (Thinking)"},
    {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium)"}
]

# Thread-safe Cache Structure for Models
_MODELS_CACHE = {
    "data": list(DEFAULT_MODELS),
    "timestamp": 0.0,
    "ttl": 300.0,  # 5 minutes cache TTL
    "is_fetching": False
}
_MODELS_LOCK = threading.Lock()


def parse_agy_models_output(raw_output):
    """
    Parse raw output from `agy models` into a structured list of model dicts.
    Extracts raw IDs and official English display names verbatim.
    """
    if not raw_output or not isinstance(raw_output, str):
        return []

    clean_text = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]|\x1b\([a-zA-Z]', '', raw_output)
    raw_lines = re.split(r'[\r\n]+', clean_text)

    noise_patterns = [
        re.compile(r'fetching\s+available\s+models', re.IGNORECASE),
        re.compile(r'^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏\s]+$'),
        re.compile(r'^usage\s*:', re.IGNORECASE),
        re.compile(r'^available\s+subcommands', re.IGNORECASE)
    ]

    models = []
    seen_ids = set()

    for line in raw_lines:
        line_str = line.strip()
        if not line_str:
            continue

        if any(p.search(line_str) for p in noise_patterns):
            continue

        parts = re.split(r'\s{2,}|\t+', line_str, maxsplit=1)
        if len(parts) == 2:
            m_id = parts[0].strip()
            m_name = parts[1].strip()
        else:
            single_split = line_str.split(None, 1)
            if len(single_split) == 2:
                m_id = single_split[0].strip()
                m_name = single_split[1].strip()
            else:
                m_id = line_str
                m_name = line_str

        if not m_id or ' ' in m_id or m_id.startswith(('-', '/', '[', '(', '*')):
            continue
        if not re.match(r'^[a-zA-Z0-9_\-\.:]+$', m_id):
            continue

        if m_id not in seen_ids:
            seen_ids.add(m_id)
            models.append({
                "id": m_id,
                "name": m_name
            })

    return models

def _fetch_models_from_cli(timeout=10.0):
    agy_cmd = get_agy_binary_path()
    env = dict(os.environ)
    env["AGY_AUTO_UPDATE"] = "1"
    env["AGY_NO_UPDATE_CHECK"] = "1"
    env["BROWSER"] = "true"
    env["GODEBUG"] = "netdns=cgo"
    env["SSL_CERT_FILE"] = "/data/data/com.termux/files/usr/etc/tls/cert.pem"
    env["LANG"] = "en_US.UTF-8"
    env["LC_ALL"] = "en_US.UTF-8"
    env.pop("LD_PRELOAD", None)

    try:
        res = subprocess.run(
            [agy_cmd, "models"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=timeout,
            env=env
        )
        if res.returncode == 0 and res.stdout:
            parsed = parse_agy_models_output(res.stdout)
            if parsed:
                return parsed
    except subprocess.TimeoutExpired:
        logger.warning("`%s models` timed out after %s seconds", agy_cmd, timeout)
    except Exception as e:
        logger.warning("Failed to execute `%s models`: %s", agy_cmd, e)
    return None

def refresh_models_cache_async():
    def _worker():
        with _MODELS_LOCK:
            if _MODELS_CACHE["is_fetching"]:
                return
            _MODELS_CACHE["is_fetching"] = True

        try:
            live_models = _fetch_models_from_cli(timeout=10.0)
            if live_models:
                with _MODELS_LOCK:
                    _MODELS_CACHE["data"] = live_models
                    _MODELS_CACHE["timestamp"] = time.time()
                    logger.info("Live models cache refreshed (%d models)", len(live_models))
        finally:
            with _MODELS_LOCK:
                _MODELS_CACHE["is_fetching"] = False

    t = threading.Thread(target=_worker, daemon=True, name="ModelsRefreshWorker")
    t.start()

def get_available_models(force_refresh=False):
    now = time.time()
    with _MODELS_LOCK:
        cached_data = list(_MODELS_CACHE["data"])
        cache_ts = _MODELS_CACHE["timestamp"]
        ttl = _MODELS_CACHE["ttl"]
        is_fetching = _MODELS_CACHE["is_fetching"]

    cache_expired = (now - cache_ts) > ttl

    if not force_refresh and not cache_expired and cache_ts > 0:
        return cached_data

    if cache_ts == 0 or force_refresh:
        live = _fetch_models_from_cli(timeout=8.0)
        if live:
            with _MODELS_LOCK:
                _MODELS_CACHE["data"] = live
                _MODELS_CACHE["timestamp"] = time.time()
            return live

    if cache_expired and not is_fetching:
        refresh_models_cache_async()

    return cached_data if cached_data else list(DEFAULT_MODELS)


def resolve_model_id(model_str):
    if not model_str:
        return "gemini-3.8-flash-medium"
    m_str = str(model_str).strip()

    # 1. Match against live cache
    models = get_available_models()
    for m in models:
        if m.get("id", "").strip().lower() == m_str.lower():
            return m["id"]
        if m.get("name", "").strip().lower() == m_str.lower():
            return m["id"]

    # 2. Match against DEFAULT_MODELS
    for m in DEFAULT_MODELS:
        if m.get("id", "").strip().lower() == m_str.lower():
            return m["id"]
        if m.get("name", "").strip().lower() == m_str.lower():
            return m["id"]

    # 3. Normalize common naming pattern e.g. "Gemini 3.8 Flash (High)"
    normalized = re.sub(r'[\(\)]', '', m_str).strip().lower()
    normalized = re.sub(r'\s+', '-', normalized)
    for m in DEFAULT_MODELS:
        if m.get("id", "").strip().lower() == normalized:
            return m["id"]

    return m_str


# ANTIGRAVITY QUOTA PARSER & CACHE
# ==============================================================================
DEFAULT_QUOTAS = [
    {"group": "Gemini Models", "limit_type": "Five Hour Limit Remaining", "pct": "83%", "pct_val": 83, "reset_time": "2026-09-11T14:19:14Z"},
    {"group": "Gemini Models", "limit_type": "Weekly Limit Remaining", "pct": "64%", "pct_val": 64, "reset_time": "2026-09-15T21:12:06Z"},
    {"group": "Claude and GPT models", "limit_type": "Five Hour Limit Remaining", "pct": "100%", "pct_val": 100, "reset_time": "2026-09-11T15:35:57Z"},
    {"group": "Claude and GPT models", "limit_type": "Weekly Limit Remaining", "pct": "66%", "pct_val": 66, "reset_time": "2026-09-17T20:03:06Z"}
]

quota_cache = {
    "data": list(DEFAULT_QUOTAS),
    "last_fetch": 0,
    "is_fetching": False,
    "ttl": 300,
}
quota_lock = threading.Lock()

def _fetch_quota_from_cli(timeout=12.0):
    if not os.path.exists(AUTH_TOKEN_FILE):
        return None
    agy_cmd = "/data/data/com.termux/files/usr/bin/agy" if os.path.exists("/data/data/com.termux/files/usr/bin/agy") else "agy"
    try:
        env = dict(os.environ)
        env["AGY_AUTO_UPDATE"] = "1"
        env["AGY_NO_UPDATE_CHECK"] = "1"
        env["BROWSER"] = "true"
        env["PATH"] = "/data/data/com.termux/files/usr/bin:" + env.get("PATH", "")

        proc = subprocess.run(
            [agy_cmd, "-p", "/usage"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            timeout=timeout
        )
        lines = proc.stdout.strip().splitlines()
        quotas = []
        for line_str in lines:
            line_str = line_str.strip()
            if not line_str or "Quota:" in line_str:
                continue
            parts = [p.strip() for p in re.split(r"\t+|\s{2,}", line_str) if p.strip()]
            if len(parts) >= 4:
                group, limit_type, pct, reset = parts[0], parts[1], parts[2], parts[3]
                quotas.append({
                    "group": group,
                    "limit_type": limit_type,
                    "pct": pct,
                    "pct_val": int(pct.replace("%", "")) if "%" in pct else 0,
                    "reset_time": reset
                })
        return quotas if quotas else None
    except subprocess.TimeoutExpired:
        logger.warning("`%s -p /usage` timed out after %s seconds", agy_cmd, timeout)
    except Exception as err:
        logger.warning("Failed to fetch quota from CLI: %s", err)
    return None

def refresh_quota_cache_async():
    def _worker():
        with quota_lock:
            if quota_cache.get("is_fetching", False):
                return
            quota_cache["is_fetching"] = True

        try:
            live = _fetch_quota_from_cli(timeout=12.0)
            with quota_lock:
                if live:
                    quota_cache["data"] = live
                quota_cache["last_fetch"] = time.time()
        finally:
            with quota_lock:
                quota_cache["is_fetching"] = False

    t = threading.Thread(target=_worker, daemon=True, name="QuotaRefreshWorker")
    t.start()

def fetch_antigravity_quota(force=False):
    now = time.time()
    with quota_lock:
        data = list(quota_cache["data"])
        last_fetch = quota_cache.get("last_fetch", 0)
        is_fetching = quota_cache.get("is_fetching", False)
        ttl = quota_cache.get("ttl", 300)

    if (force or (now - last_fetch > ttl) or last_fetch == 0) and not is_fetching:
        refresh_quota_cache_async()

    return data

def handle_quota_get(client_sock, force=False):
    data = fetch_antigravity_quota(force=force)
    send_json_response(client_sock, {
        "quotas": data,
        "last_updated": quota_cache["last_fetch"]
    })

