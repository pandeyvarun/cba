#!/usr/bin/env python3
"""STEP 3 - CATEGORY EXTRACTION.   input: data/interim/comments_clean.csv   output: data/processed/comments_categorised.csv

Labels every comment with Account Type (Business / Personal / General), Primary + Secondary Area (29 sub-areas, config/taxonomy.json)
and Sentiment (star rating where present, VADER otherwise). `rules` is free and reproducible; `hybrid` sends only ambiguous rows to
Claude (needs ANTHROPIC_API_KEY); `llm` labels everything with Claude.

  python pipeline/03_categorise.py
  python pipeline/03_categorise.py --mode hybrid
"""
from _common import config, io, need, parser, path, start

ap = parser(__doc__)
ap.add_argument("--input", help="default data/interim/comments_clean.csv")
ap.add_argument("--mode", choices=["rules", "llm", "hybrid"], help="default: settings.yaml categorise.mode")
ap.add_argument("--out", help="default data/processed/comments_categorised.csv")
a = start(ap)

from ci.categorise import categorise_df  # noqa: E402

df = io.read(a.input or need(path("interim", "comments_clean.csv"), "pipeline/02_process.py"))
out_df = categorise_df(df, a.mode)
out = a.out or path("processed", "comments_categorised.csv")
io.write(out_df, out)
ours = out_df[out_df.bank == config.settings()["our_bank"]]
print(f"[categorise] {len(out_df):,} rows -> {out}")
print(f"  {config.settings()['our_bank']}: {len(ours):,} rows | other/unclassified {ours.primary_area.str.startswith('Other').mean():.1%} | "
      f"sentiment {ours.sentiment.value_counts(normalize=True).round(3).to_dict()} | segment {ours.account_type.value_counts().to_dict()}")
