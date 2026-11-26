import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ.setdefault("CI_ROOT", str(ROOT))


import pytest  # noqa: E402


@pytest.fixture
def tmp_paths(tmp_path, monkeypatch):
    """Redirect every pipeline directory into tmp_path so tests never touch real data."""
    from ci import config
    for k in ("raw", "interim", "processed", "reports", "dist"):
        monkeypatch.setitem(config.settings()["paths"], k, str(tmp_path / k))
    return tmp_path
