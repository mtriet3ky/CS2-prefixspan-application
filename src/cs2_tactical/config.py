"""Repository paths for the editable installation."""
from pathlib import Path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / 'data'
WEB_DIR = PROJECT_ROOT / 'web'
