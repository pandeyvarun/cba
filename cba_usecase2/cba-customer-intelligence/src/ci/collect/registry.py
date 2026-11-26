"""Build collectors from config/sources.yaml and run them."""
from __future__ import annotations

from datetime import date, datetime
from typing import Iterable

import pandas as pd

from .. import config
from ..schema import RAW_COLUMNS
from .app_store import AppStoreCollector
from .base import Collector
from .file_import import FileImportCollector
from .google_play import GooglePlayCollector
from .hackernews import HackerNewsCollector
from .reddit import RedditCollector
from .reddit_archive import RedditArchiveCollector
from .servicenow import ServiceNowCollector

COLLECTORS: dict[str, type[Collector]] = {
    "google_play": GooglePlayCollector,
    "app_store": AppStoreCollector,
    "reddit": RedditCollector,
    "reddit_archive": RedditArchiveCollector,
    "servicenow": ServiceNowCollector,
    "file_import": FileImportCollector,
    "hackernews": HackerNewsCollector,
}


def build_collector(entry: dict) -> Collector:
    return COLLECTORS[entry["collector"]](entry["name"], entry["bank"], entry.get("params", {}))


def collect_all(only: Iterable[str] | None = None, since: date | None = None) -> pd.DataFrame:
    """Run every enabled source (or the named ones). One failing source never stops the others."""
    config.load_env()
    frames, errors = [], []
    for entry in config.sources_config():
        if only and entry["name"] not in only and entry["collector"] not in only:
            continue
        if not only and not entry.get("enabled", True):
            continue
        try:
            rows = [c.to_row() for c in build_collector(entry).fetch(since)]
            print(f"[collect] {entry['name']}: {len(rows)} rows")
            frames.append(pd.DataFrame(rows, columns=RAW_COLUMNS))
        except Exception as e:  # noqa: BLE001 - report and continue
            errors.append((entry["name"], repr(e)))
            print(f"[collect] {entry['name']} FAILED: {e!r}")
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=RAW_COLUMNS)
    df.attrs["errors"] = errors
    return df
