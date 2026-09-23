#!/usr/bin/env python3
"""
Antigravity Companion - Doctor Diagnostic Tool
Verifies local connectivity, WebSocket bridge, and Termux external app permissions.
"""

import sys
import os
import json
import socket
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AntigravityDoctor")

def check_port(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def check_termux_properties() -> bool:
    props_path = os.path.expanduser("~/.termux/termux.properties")
    if not os.path.exists(props_path):
        return False
    try:
        with open(props_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("allow-external-apps") and "true" in line.lower():
                    return True
    except Exception as e:
        logger.warning(f"Error reading {props_path}: {e}")
    return False

def run_doctor():
    logger.info("بدء فحص وتشخيص منظومة Antigravity Companion...")

    results = {
        "status": "PASS",
        "checks": []
    }

    # 1. Check Local WebSocket Automation Bridge
    ws_port = 8765
    ws_ok = check_port("127.0.0.1", ws_port)
    results["checks"].append({
        "name": "WebSocket Automation Bridge (127.0.0.1:8765)",
        "passed": ws_ok,
        "detail": "يعمل بنجاح" if ws_ok else "غير متصل (تأكد من تثبيت التطبيق وتفعيل خدمة إمكانية الوصول)"
    })

    # 2. Check Local Python Server
    py_port = 7681
    py_ok = check_port("127.0.0.1", py_port)
    results["checks"].append({
        "name": "Termux Python Web Server (127.0.0.1:7681)",
        "passed": py_ok,
        "detail": "يعمل بنجاح" if py_ok else "غير متصل (يتم تشغيله تلقائياً عند فتح التطبيق)"
    })

    # 3. Check Termux Properties for allow-external-apps
    props_ok = check_termux_properties()
    results["checks"].append({
        "name": "Termux External Apps Permission (allow-external-apps)",
        "passed": props_ok,
        "detail": "مفعل في ~/.termux/termux.properties" if props_ok else "غير مفعل (قم بتفعيل allow-external-apps=true لدعم التشغيل الصامت)"
    })

    failed_count = sum(1 for c in results["checks"] if not c["passed"])
    if failed_count > 0:
        results["status"] = "WARN"

    logger.info("=" * 55)
    logger.info("تقرير فحص وتشخيص النظام (Antigravity Doctor Report)")
    logger.info("=" * 55)
    for c in results["checks"]:
        mark = "[PASS]" if c["passed"] else "[WARN]"
        logger.info(f"{mark} {c['name']}")
        logger.info(f"       التفاصيل: {c['detail']}")

    logger.info(f"النتيجة الإجمالية: {results['status']}")
    logger.info("=" * 55)

    return 0 if results["status"] == "PASS" else 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Antigravity Diagnostic Doctor")
    parser.add_argument("--doctor", action="store_true", help="تشغيل الفحص الشامل للبيئة")
    args = parser.parse_args()

    sys.exit(run_doctor())
