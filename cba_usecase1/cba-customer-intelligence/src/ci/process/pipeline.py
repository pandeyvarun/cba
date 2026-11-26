from __future__ import annotations

import pandas as pd

from .. import config
from ..schema import CLEAN_COLUMNS
from .clean import clean_frame


def process_df(raw: pd.DataFrame) -> pd.DataFrame:
    """raw -> cleaned comments (see docs/data-contract.md)."""
    s = config.settings()["processing"]
    for c in ("id", "author", "url", "meta", "channel"):
        if c not in raw.columns:
            raw[c] = ""
    df = clean_frame(raw, min_chars=s["min_chars"], min_chars_rated=s.get("min_chars_rated", 1), max_chars=s["max_chars"], redact_pii=s["redact_pii"],
                     drop_duplicates=s["drop_duplicates"], hash_authors=s["hash_authors"])
    stats = {"in": len(raw), "out": len(df), "pii": int(df["pii_redacted"].sum())}
    print(f"[process] {stats}")
    return df[[c for c in CLEAN_COLUMNS if c in df.columns]]
