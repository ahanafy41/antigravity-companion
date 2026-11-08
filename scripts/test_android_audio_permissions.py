import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "app" / "src" / "main" / "AndroidManifest.xml"
MAIN_ACTIVITY_PATH = ROOT / "app" / "src" / "main" / "java" / "com" / "antigravity" / "companion" / "MainActivity.java"

def test_manifest():
    content = MANIFEST_PATH.read_text(encoding="utf-8")
    assert 'android.permission.RECORD_AUDIO' in content, "AndroidManifest.xml is missing RECORD_AUDIO permission"
    assert 'android.permission.MODIFY_AUDIO_SETTINGS' in content, "AndroidManifest.xml is missing MODIFY_AUDIO_SETTINGS permission"
    print("Manifest permission test passed.")

def test_main_activity():
    content = MAIN_ACTIVITY_PATH.read_text(encoding="utf-8")
    assert 'RECORD_AUDIO' in content, "MainActivity.java must reference RECORD_AUDIO for runtime permission check"
    assert 'RESOURCE_AUDIO_CAPTURE' in content, "MainActivity.java WebChromeClient must handle RESOURCE_AUDIO_CAPTURE"
    assert 'request.grant' in content, "MainActivity.java must call request.grant for audio permission"
    assert 'request::deny' not in content, "MainActivity.java must not unconditionally deny permissions"
    print("MainActivity audio permission test passed.")

if __name__ == "__main__":
    try:
        test_manifest()
        test_main_activity()
        print("ALL ANDROID AUDIO PERMISSION TESTS PASSED")
    except AssertionError as e:
        print(f"FAILED: {e}", file=sys.stderr)
        sys.exit(1)
