#!/usr/bin/env python3
"""STEP 4 - ENRICHMENT (analysis columns).   input: data/processed/comments_categorised.csv   output: data/processed/comments_enriched.csv

Adds the two narrative columns of the analysed workbook for our bank's comments:
  * areas_for_improvement  - playbook text for the sub-area, refined by keywords in the comment (config/improvement_refinements.json)
  * competitors_offering   - what ANZ/NAB/Westpac customers say about the same sub-area + n / % positive / % negative per rival (computed)

  python pipeline/04_enrich.py
"""
from _common import io, need, parser, path, start

ap = parser(__doc__)
ap.add_argument("--input", help="default data/processed/comments_categorised.csv")
ap.add_argument("--out", help="default data/processed/comments_enriched.csv")
a = start(ap)

from ci.report import enrich_df  # noqa: E402

df = io.read(a.input or need(path("processed", "comments_categorised.csv"), "pipeline/03_categorise.py"))
out_df = enrich_df(df)
out = a.out or path("processed", "comments_enriched.csv")
io.write(out_df, out)
filled = (out_df.areas_for_improvement != "").sum()
print(f"[enrich] {filled:,} comments enriched -> {out}")
