"""Per-comment narrative columns for the analysed workbook:

* `areas_for_improvement` - playbook text for the comment's sub-area, refined by keyword rules
  (config/improvement_refinements.json); positives -> "None raised - strength to retain: ...";
  neutral -> "Opportunity: ...".
* `competitors_offering` - what ANZ / NAB / Westpac customers say about the same sub-area (playbook text) plus an
  evidence count per rival bank (n, % positive / % negative) computed from the data - numbers come from code.

Only our bank's rows (settings.our_bank) are enriched; competitor rows are left blank.
"""
from __future__ import annotations

import re
from functools import lru_cache

import pandas as pd

from .. import config


@lru_cache(maxsize=1)
def _refinements() -> tuple[dict[str, list[tuple[re.Pattern, str]]], str]:
    cfg = config.load_json("improvement_refinements.json")
    by_area: dict[str, list[tuple[re.Pattern, str]]] = {}
    for area, rx, text in cfg["rules"]:
        by_area.setdefault(area, []).append((re.compile(rx, re.I), text))
    return by_area, cfg["na_text"]


def is_other(area: str) -> bool:
    return area == config.taxonomy()["other"]["secondary"]


def improvement(area: str, sentiment: str, comment: str) -> str:
    refine, na = _refinements()
    if is_other(area):
        return na
    pb = config.playbook()[area]
    if sentiment == "Positive":
        return f"None raised - strength to retain: {pb['strength']}."
    text = pb["improvement"]
    for rx, t in refine.get(area, []):
        if rx.search(comment or ""):
            text = t
            break
    return ("Opportunity: " + text) if sentiment == "Neutral" else text


def rival_stats(df: pd.DataFrame) -> dict[str, str]:
    """area -> 'ANZ n=78 (23% pos / 44% neg) | NAB ... | Westpac ...' computed from the rivals' rows."""
    s = config.settings()
    rivals = [b for b in s["banks"] if b != s["our_bank"]]
    out: dict[str, str] = {}
    for area in config.playbook():
        sub = df[df["secondary_area"] == area]
        parts = []
        for b in rivals:
            x = sub[sub["bank"] == b]
            if len(x) == 0:
                parts.append(f"{b} n=0")
            else:
                parts.append(f"{b} n={len(x)} ({(x.sentiment == 'Positive').mean() * 100:.0f}% pos / {(x.sentiment == 'Negative').mean() * 100:.0f}% neg)")
        out[area] = " | ".join(parts)
    return out


def competitor_text(area: str, stats: dict[str, str]) -> str:
    if is_other(area):
        return config.load_json("improvement_refinements.json")["na_text"]
    return config.playbook()[area]["competitor_offer"] + "  [Competitor comment evidence: " + stats[area] + "]"


def enrich_df(df: pd.DataFrame) -> pd.DataFrame:
    """Add `areas_for_improvement` and `competitors_offering` for our bank's rows."""
    s = config.settings()
    out = df.copy()
    ours = out["bank"] == s["our_bank"]
    stats = rival_stats(out)
    out["areas_for_improvement"] = ""
    out["competitors_offering"] = ""
    sub = out[ours]
    out.loc[ours, "areas_for_improvement"] = [improvement(a, st, c) for a, st, c in zip(sub.secondary_area, sub.sentiment, sub.text_clean.fillna(""))]
    cache = {a: competitor_text(a, stats) for a in sub.secondary_area.unique()}
    out.loc[ours, "competitors_offering"] = sub.secondary_area.map(cache).values
    return out
