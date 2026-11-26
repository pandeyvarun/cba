"""categorised comments -> scorecards, trends, insights (written to data/reports)."""
from __future__ import annotations

import json

import pandas as pd

from .. import config
from .insights import build_insights, exec_summary
from .metrics import SEGMENTS, Metrics


def analyse_df(df: pd.DataFrame) -> dict:
    m = Metrics(df)
    out_dir = config.path("reports")
    result: dict = {"insights": {}, "summary": {}}
    for seg in SEGMENTS:
        t = m.area_table(seg)
        t.to_csv(out_dir / f"scorecard_{seg}.csv", index=False)
        result["insights"][seg] = {role: build_insights(m, seg, role) for role in ("lead", "po")}
        result["summary"][seg] = exec_summary(m, seg)
    m.trend().to_csv(out_dir / "trend.csv", index=False)
    (out_dir / "insights.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[analyse] wrote scorecards, trend.csv and insights.json to {out_dir}")
    return result
