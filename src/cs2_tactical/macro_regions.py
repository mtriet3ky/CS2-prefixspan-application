"""Load the published map regions used for tactical analysis."""
import json
from functools import lru_cache
from .config import DATA_DIR

@lru_cache(maxsize=1)
def load():
    return json.loads((DATA_DIR / 'assets/macro_regions_v1.json').read_text(encoding='utf-8'))
