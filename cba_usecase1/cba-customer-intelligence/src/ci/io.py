"""Tiny IO helpers: every stage reads/writes CSV (diff-able, Excel-friendly)."""
from __future__ import annotations

from pathlib import Path

import pandas as pd


def read(path: str | Path) -> pd.DataFrame:
    p = Path(path)
    if p.suffix == ".jsonl":
        return pd.read_json(p, lines=True)
    if p.suffix in (".xlsx", ".xls"):
        return pd.read_excel(p)
    return pd.read_csv(p, keep_default_na=False, na_values=[""])


def write(df: pd.DataFrame, path: str | Path) -> Path:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.suffix == ".jsonl":
        df.to_json(p, orient="records", lines=True, force_ascii=False)
    else:
        df.to_csv(p, index=False)
    return p
