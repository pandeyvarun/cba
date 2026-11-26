"""Incremental raw store: merge freshly collected rows into the latest data/raw/comments_*.csv.

The store IS the newest `comments_<date>.csv` - downstream stages already read the newest file, so an
incremental run just writes a bigger file. Rows are de-duplicated across runs by a stable key:
(bank, source, channel, id) when the channel gives an id, else a hash of (bank, source, date, text).
"""
from __future__ import annotations

import hashlib
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from .. import config, io
from ..schema import RAW_COLUMNS


def latest_raw() -> Path | None:
    files = sorted(config.path("raw").glob("comments_*.csv"))
    return files[-1] if files else None


def _key(df: pd.DataFrame) -> pd.Series:
    def one(r) -> str:
        rid = str(r["id"]) if pd.notna(r["id"]) and str(r["id"]).strip() else ""
        if rid:
            return f"id|{r['bank']}|{r['source']}|{r['channel']}|{rid}"
        h = hashlib.sha1(f"{r['date']}|{str(r['text']).strip().lower()}".encode("utf-8")).hexdigest()[:16]
        return f"tx|{r['bank']}|{r['source']}|{h}"
    return df.apply(one, axis=1) if len(df) else pd.Series([], dtype=str)


def merge(existing: pd.DataFrame | None, new: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Append `new` to `existing`, dropping rows already present. Returns (merged, number_of_new_rows)."""
    new = new.reindex(columns=RAW_COLUMNS)
    if existing is None or existing.empty:
        merged = new.copy()
        merged = merged.loc[~_key(merged).duplicated()]
        return merged.reset_index(drop=True), len(merged)
    existing = existing.reindex(columns=RAW_COLUMNS)
    seen = set(_key(existing))
    fresh = new.loc[[k not in seen for k in _key(new)]]
    fresh = fresh.loc[~_key(fresh).duplicated()]
    return pd.concat([existing, fresh], ignore_index=True), len(fresh)


def since_from_store(existing: pd.DataFrame | None, overlap_days: int | None = None) -> date | None:
    """Collection start date: newest stored date minus an overlap window (late-arriving reviews)."""
    if existing is None or existing.empty:
        return None
    last = pd.to_datetime(existing["date"], errors="coerce").max()
    if pd.isna(last):
        return None
    days = config.settings().get("collect", {}).get("overlap_days", 3) if overlap_days is None else overlap_days
    return last.date() - timedelta(days=int(days))


def load_store() -> pd.DataFrame | None:
    p = latest_raw()
    return io.read(p) if p else None


def save_store(df: pd.DataFrame) -> Path:
    out = config.path("raw") / f"comments_{date.today().isoformat()}.csv"
    io.write(df, out)
    return out
