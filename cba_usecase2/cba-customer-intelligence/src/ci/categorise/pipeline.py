"""cleaned comments -> categorised comments. Modes: rules | llm | hybrid."""
from __future__ import annotations

import pandas as pd

from .. import config
from .rules import classify_area
from .segment import account_type
from .sentiment import sentiment


def categorise_df(df: pd.DataFrame, mode: str | None = None) -> pd.DataFrame:
    cfg = config.settings()["categorise"]
    mode = mode or cfg["mode"]
    out = df.copy().reset_index(drop=True)
    out["rid"] = out.index.astype(str)
    recs = []
    for r in out.itertuples():
        res = classify_area(r.text_clean, r.rating)
        recs.append({
            "primary_area": res.primary, "secondary_area": res.secondary,
            "account_type": account_type(r.text_clean), "sentiment": sentiment(r.text_clean, r.rating),
            "confidence": round(min(1.0, 0.5 + res.margin / 10), 2) if res.matched else 0.3, "method": "rules",
            "_amb": (not res.matched) or res.margin < cfg["low_confidence_margin"],
        })
    cat = pd.DataFrame(recs)
    out = pd.concat([out, cat.drop(columns="_amb")], axis=1)

    if mode in ("llm", "hybrid"):
        from .llm import categorise_llm
        target = out if mode == "llm" else out[cat["_amb"].values]
        rows = [{"id": r.rid, "text": r.text_clean, "rating": None if pd.isna(r.rating) else int(r.rating)} for r in target.itertuples()]
        print(f"[categorise] sending {len(rows)} comments to Claude ({mode})")
        res = categorise_llm(rows)
        for rid, v in res.items():
            i = int(rid)
            out.loc[i, ["primary_area", "secondary_area", "account_type", "sentiment", "confidence", "method"]] = [
                v["primary"], v["secondary"], v["account_type"], v["sentiment"], v["confidence"], "llm"]
    return out.drop(columns="rid")
