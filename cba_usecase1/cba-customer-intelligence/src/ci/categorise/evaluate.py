"""Score the categoriser against evals/classification_golden.jsonl.   python -m ci.categorise.evaluate [--mode rules|llm]"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from .. import config
from .pipeline import categorise_df


def run(mode: str = "rules") -> dict:
    rows = [json.loads(l) for l in (config.ROOT / "evals" / "classification_golden.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    df = pd.DataFrame({"text_clean": [r["text"] for r in rows], "rating": [r.get("rating") for r in rows], "bank": "CBA", "source": "golden", "date": "2026-01-01"})
    out = categorise_df(df, mode)
    acc = {
        "area": sum(o == r["secondary"] for o, r in zip(out.secondary_area, rows)) / len(rows),
        "primary": sum(o == r["primary"] for o, r in zip(out.primary_area, rows)) / len(rows),
        "sentiment": sum(o == r["sentiment"] for o, r in zip(out.sentiment, rows)) / len(rows),
        "segment": sum(o == r["account_type"] for o, r in zip(out.account_type, rows)) / len(rows),
    }
    print(json.dumps({"mode": mode, "n": len(rows), **{k: round(v, 2) for k, v in acc.items()}}))
    for o, r in zip(out.itertuples(), rows):
        if o.secondary_area != r["secondary"]:
            print(f"  MISS area: expected '{r['secondary']}' got '{o.secondary_area}' :: {r['text'][:70]}")
    return acc


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="rules")
    run(ap.parse_args().mode)
