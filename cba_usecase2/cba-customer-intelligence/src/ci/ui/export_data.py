"""categorised comments -> the JSON bundle the web app embeds (data.json)."""
from __future__ import annotations

import json
import re

import pandas as pd

from .. import config
from ..schema import ACCOUNT_TYPES, SENTIMENTS


def _clip(t: str, n: int = 300) -> str:
    t = re.sub(r"\s+", " ", str(t)).strip()
    return t if len(t) <= n else t[: n - 1].rstrip() + "\u2026"


def export_data(df: pd.DataFrame) -> dict:
    s = config.settings()
    tax, seg, play = config.taxonomy(), config.segments(), config.playbook()
    banks = s["banks"]
    areas = [(a["primary"], a["secondary"]) for a in tax["areas"] if a["secondary"] in play]
    areas.append((tax["other"]["primary"], tax["other"]["secondary"]))
    aidx = {a[1]: i for i, a in enumerate(areas)}
    bidx = {b: i for i, b in enumerate(banks)}
    acidx = {a: i for i, a in enumerate(ACCOUNT_TYPES)}
    sidx = {x: i for i, x in enumerate(SENTIMENTS)}

    d = df.copy()
    d["month"] = d["date"].astype(str).str[:7]
    months = sorted(d["month"].unique())
    midx = {m: i for i, m in enumerate(months)}
    srcs = sorted(d["source"].unique())
    sridx = {x: i for i, x in enumerate(srcs)}
    d = d[d["bank"].isin(bidx) & d["secondary_area"].isin(aidx)].copy()
    d["bi"], d["ai"] = d["bank"].map(bidx), d["secondary_area"].map(aidx)
    d["ci"], d["si"] = d["account_type"].map(acidx), d["sentiment"].map(sidx)
    d["mi"], d["sri"] = d["month"].map(midx), d["source"].map(sridx)

    def grp(cols, **agg):
        return d.groupby(cols).agg(**agg).reset_index() if agg else d.groupby(cols).size().reset_index(name="n")

    our = bidx[s["our_bank"]]
    cba = d[d["bi"] == our].sort_values("date", ascending=False)
    rated = d[d["rating"].notna()]
    ex = {}
    for _, a in areas[:-1]:
        for b in banks:
            sub = d[(d["bank"] == b) & (d["secondary_area"] == a) & d["text_clean"].str.len().between(50, 260)]
            e = {}
            for sent, key in (("Positive", "pos"), ("Negative", "neg")):
                x = sub[sub["sentiment"] == sent]
                x = x.sample(min(3, len(x)), random_state=5) if len(x) else x
                e[key] = [[r.date, int(r.sri), _clip(r.text_clean, 230)] for r in x.itertuples()]
            ex[f"{b}|{aidx[a]}"] = e
    text = {}
    for p, a in areas[:-1]:
        pb = play[a]
        text[aidx[a]] = {"pos": pb["positives"], "neg": pb["negatives"], "imp": pb["improvement"], "strength": pb["strength"],
                         "comp": pb["competitor_offer"], "feat": pb["mobile_features"], "rec": pb["mobile_recommendation"],
                         "bizrec": pb["business_recommendation"], "bizintel": pb["business_intel"]}
    feats = config.load_json("competitor_features.json")["rows"]
    biz_keys = ["BIZ_NEG", "BIZ_IDIOM", "BIZ_TITLES", "SPECIFIC", "GENERIC_STRONG", "OTHER_KW", "JOB_CHATTER", "PERSONAL_EXPLICIT", "PERSONAL_KW"]
    r = rated.groupby(["bi", "mi"]).agg(s=("rating", "sum"), n=("rating", "size")).reset_index()
    ra = rated[rated["bi"] == our].groupby("ai").agg(s=("rating", "sum"), n=("rating", "size")).reset_index()
    return {
        "banks": banks, "accts": ACCOUNT_TYPES, "sents": SENTIMENTS, "areas": areas, "months": months, "srcs": srcs,
        "agg": grp(["bi", "ai", "ci", "si"]).values.tolist(),
        "trend": grp(["bi", "mi", "ci", "si"]).values.tolist(),
        "trendArea": cba.groupby(["ai", "mi", "ci", "si"]).size().reset_index(name="n").values.tolist(),
        "rating": r.values.tolist(), "ratingArea": ra.values.tolist(),
        "src": grp(["bi", "sri", "si"]).values.tolist(),
        "cba": [[r.date, int(r.sri), None if pd.isna(r.rating) else int(r.rating), int(r.ci), int(r.ai), int(r.si), _clip(r.text_clean)]
                for r in cba.itertuples()],
        "ex": ex, "text": text,
        "cls": {"taxonomy": [[a["primary"], a["secondary"], a["patterns"]] for a in tax["areas"]],
                "bankword": tax["bankword"], "biz": {k: seg[k] for k in biz_keys}},
        "titles": {a: play[a]["title"] for _, a in areas[:-1]},
        "effort": {a: play[a]["effort"] for _, a in areas[:-1]},
        "nomobile": [a for _, a in areas[:-1] if not play[a]["mobile"]],
        "matrix": feats, "asof": s["project"]["as_of"] or str(d["date"].max()), "other": len(areas) - 1,
    }


def to_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
