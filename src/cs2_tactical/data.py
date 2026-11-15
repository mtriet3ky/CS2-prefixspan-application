"""Validate runtime data and restore cache dependency timestamps."""
import json, os
from .config import DATA_DIR, PROJECT_ROOT

def prepare():
    manifest = DATA_DIR / 'file_timestamps.json'
    if not manifest.is_file():
        raise SystemExit('Runtime data is missing. Run git lfs pull in the repository.')
    for row in json.loads(manifest.read_text(encoding='utf-8')):
        path = PROJECT_ROOT / row['path']
        if not path.is_file() or path.stat().st_size != row['size']:
            raise SystemExit(f'Missing or incomplete data: {path}. Run git lfs pull.')
        if path.stat().st_mtime_ns != row['mtime_ns']:
            os.utime(path, ns=(path.stat().st_atime_ns, row['mtime_ns']))
