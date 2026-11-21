import json
import os
from pathlib import Path
import re
import tempfile
import time
import uuid

APP_ID_REGEX = re.compile(r'^[a-zA-Z0-9_-]{1,64}$')
MAX_CODE_SIZE_BYTES = 500 * 1024  # 500 KB
MAX_TITLE_LENGTH = 100
MAX_STORED_APPS = 200

def get_apps_dir(data_dir: str | Path) -> Path:
    apps_dir = Path(data_dir) / "apps"
    apps_dir.mkdir(parents=True, exist_ok=True)
    return apps_dir.resolve()

def validate_app_id(app_id: str, data_dir: str | Path) -> Path:
    if not app_id or not isinstance(app_id, str):
        raise ValueError("معرف التطبيق غير صالح")
    if not APP_ID_REGEX.match(app_id):
        raise ValueError("معرف التطبيق يحتوي على محارف غير مسموحة")
    
    apps_dir = get_apps_dir(data_dir)
    target_path = (apps_dir / f"{app_id}.json").resolve()
    
    # Canonical path check against path traversal
    if os.path.commonpath([str(apps_dir), str(target_path)]) != str(apps_dir):
        raise ValueError("محاولة وصول غير مصرح بها للمسار")
    
    return target_path

def _atomic_write_json(file_path: Path, data: dict):
    parent_dir = file_path.parent
    parent_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=str(parent_dir), delete=False, encoding='utf-8') as tf:
        json.dump(data, tf, ensure_ascii=False, indent=2)
        tf.flush()
        os.fsync(tf.fileno())
        temp_name = tf.name
    os.replace(temp_name, str(file_path))

def _rebuild_index_from_disk(apps_dir: Path) -> list[dict]:
    apps_meta = []
    for item in apps_dir.glob("app_*.json"):
        if item.name == "index.json":
            continue
        try:
            with open(item, 'r', encoding='utf-8') as f:
                content = json.load(f)
                apps_meta.append({
                    "id": content.get("id", item.stem),
                    "title": content.get("title", item.stem),
                    "description": content.get("description", ""),
                    "created_at": content.get("created_at", ""),
                    "updated_at": content.get("updated_at", "")
                })
        except Exception:
            continue
    apps_meta.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
    _atomic_write_json(apps_dir / "index.json", {"apps": apps_meta})
    return apps_meta

def list_apps(data_dir: str | Path) -> list[dict]:
    apps_dir = get_apps_dir(data_dir)
    index_file = apps_dir / "index.json"
    if not index_file.exists():
        return _rebuild_index_from_disk(apps_dir)
    
    try:
        with open(index_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get("apps", [])
    except Exception:
        # Fallback to rebuilding the index if corrupted
        return _rebuild_index_from_disk(apps_dir)

def get_app(data_dir: str | Path, app_id: str) -> dict | None:
    target_path = validate_app_id(app_id, data_dir)
    if not target_path.exists():
        return None
    try:
        with open(target_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None

def save_app(data_dir: str | Path, app_data: dict) -> dict:
    apps_dir = get_apps_dir(data_dir)
    current_apps = list_apps(data_dir)
    
    title = (app_data.get("title") or "").strip()
    if not title:
        raise ValueError("عنوان التطبيق مطلوب")
    if len(title) > MAX_TITLE_LENGTH:
        raise ValueError(f"عنوان التطبيق يجب ألا يتجاوز {MAX_TITLE_LENGTH} حرفاً")
    
    code = app_data.get("code") or ""
    if not code:
        raise ValueError("كود التطبيق مطلوب")
    if len(code.encode('utf-8')) > MAX_CODE_SIZE_BYTES:
        raise ValueError("حجم كود التطبيق يتجاوز الحد الأقصى المسموح به (500 كيلوبايت)")
    
    description = (app_data.get("description") or "").strip()
    now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    
    app_id = (app_data.get("id") or "").strip()
    if app_id:
        target_path = validate_app_id(app_id, data_dir)
        existing = get_app(data_dir, app_id)
        created_at = existing.get("created_at") if existing else now_iso
    else:
        if len(current_apps) >= MAX_STORED_APPS:
            raise ValueError(f"تم الوصول للحد الأقصى للتطبيقات المخزنة ({MAX_STORED_APPS} تطبيق)")
        app_id = f"app_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        target_path = validate_app_id(app_id, data_dir)
        created_at = now_iso

    full_payload = {
        "id": app_id,
        "title": title,
        "description": description,
        "code": code,
        "created_at": created_at,
        "updated_at": now_iso
    }
    
    # 1. Atomic write to individual app file
    _atomic_write_json(target_path, full_payload)
    
    # 2. Update central index
    updated_apps = [a for a in current_apps if a.get("id") != app_id]
    metadata = {
        "id": app_id,
        "title": title,
        "description": description,
        "created_at": created_at,
        "updated_at": now_iso
    }
    updated_apps.insert(0, metadata)
    _atomic_write_json(apps_dir / "index.json", {"apps": updated_apps})
    
    return full_payload

def delete_app(data_dir: str | Path, app_id: str) -> bool:
    target_path = validate_app_id(app_id, data_dir)
    if not target_path.exists():
        return False
    
    try:
        target_path.unlink()
    except Exception:
        return False
    
    apps_dir = get_apps_dir(data_dir)
    current_apps = list_apps(data_dir)
    updated_apps = [a for a in current_apps if a.get("id") != app_id]
    _atomic_write_json(apps_dir / "index.json", {"apps": updated_apps})
    return True
