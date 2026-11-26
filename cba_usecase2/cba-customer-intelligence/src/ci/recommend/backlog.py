"""Scorecard + playbook -> prioritised backlog items (data/reports/backlog.json)."""
from __future__ import annotations

import json
import re

import pandas as pd

from .. import config
from ..analyse.metrics import Metrics, short


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def band(score: int) -> str:
    for name, floor in config.settings()["recommend"]["priority_bands"].items():
        if score >= floor:
            return name
    return "Low"


def _nan_to_none(o):
    """NaN is not valid JSON (and breaks strict parsers / the API): store missing values as null."""
    if isinstance(o, dict):
        return {k: _nan_to_none(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_nan_to_none(v) for v in o]
    return None if isinstance(o, float) and o != o else o


def acceptance_criteria(text: str, n: int = 4) -> list[str]:
    parts = [p.strip() for p in re.split(r"(?<=\.)\s+|;\s+", text) if len(p.strip()) > 20]
    return [p[0].upper() + p[1:] for p in parts[:n]]


def build_backlog(m: Metrics, seg: str = "all", mobile_only: bool | None = None, limit: int | None = None) -> list[dict]:
    cfg = config.settings()["recommend"]
    play = config.playbook()
    mobile_only = cfg["mobile_only_default"] if mobile_only is None else mobile_only
    t = m.area_table(seg)
    t = t[(t.our_n >= m.cfg["min_n_area"]) & ~t.area.str.startswith("Overall app experience")]
    items = []
    for r in t.itertuples():
        pb = play.get(r.area)
        if not pb or (mobile_only and not pb["mobile"]):
            continue
        rec = pb["mobile_recommendation"] + (" " + pb["business_recommendation"].removeprefix("BUSINESS: ") if seg != "Personal" and pb["business_recommendation"] else "")
        examples = m.df[(m.df.bank == m.our) & (m.df.secondary_area == r.area) & (m.df.sentiment == "Negative")
                        & m.df.text_clean.str.len().between(40, 240)].text_clean.head(2).tolist()
        items.append({
            "area": r.area, "primary_area": r.primary_area, "title": pb["title"], "summary": f"[{m.our} App] {pb['title']}",
            "priority_score": int(r.priority_score), "priority": band(int(r.priority_score)), "effort": pb["effort"],
            "evidence": {"comments": int(r.our_n), "negative": int(r.our_neg), "negative_pct": r.our_neg_pct,
                         "rival_negative_pct": r.rival_neg_pct, "gap_pts": r.gap_pts, "best_rival": r.best_rival},
            "problem": pb["negatives"], "customer_voice": examples,
            "competitor_benchmark": [pb["competitor_offer"], pb["mobile_features"]],
            "recommendation": rec, "acceptance_criteria": acceptance_criteria(rec),
            "labels": ["customer-intelligence", "voc", slug(r.primary_area), slug(r.area)] + cfg.get("extra_labels", []),
            "segment": seg,
        })
    items.sort(key=lambda x: -x["priority_score"])
    return _nan_to_none(items[: (limit or cfg["max_items"])])


def write_backlog(items: list[dict]) -> None:
    out = config.path("reports")
    (out / "backlog.json").write_text(json.dumps(items, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    pd.json_normalize(items).to_csv(out / "backlog.csv", index=False)
    print(f"[recommend] {len(items)} backlog items -> {out / 'backlog.json'}")
