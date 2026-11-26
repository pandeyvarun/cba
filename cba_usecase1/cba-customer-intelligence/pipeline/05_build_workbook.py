#!/usr/bin/env python3
"""STEP 5 - ANALYSED WORKBOOK.   input: data/processed/comments_enriched.csv   output: data/reports/<bank>-user-comments-analysed.xlsx

Tabs: Method & Notes | Comments (original columns + Account Type, Primary Area, Secondary Area, Sentiment, Areas for improvement,
What competitors are offering) | Summary | Competitor Reference | Intel - Business Only | Intel - Business + General |
Mobile App Feature Matrix.

  python pipeline/05_build_workbook.py
  python pipeline/05_build_workbook.py --out ~/Desktop/commbank-user-comments-analysed.xlsx
"""
from _common import config, io, need, parser, path, read_stats, start

ap = parser(__doc__)
ap.add_argument("--input", help="default data/processed/comments_enriched.csv")
ap.add_argument("--out", help="default data/reports/<bank>-user-comments-analysed.xlsx")
a = start(ap)

from ci.report import build_workbook  # noqa: E402

df = io.read(a.input or need(path("processed", "comments_enriched.csv"), "pipeline/04_enrich.py"))
stem = {"CBA": "commbank"}.get(config.settings()["our_bank"], config.settings()["our_bank"].lower())
out = a.out or path("reports", f"{stem}-user-comments-analysed.xlsx")
build_workbook(df, out, process=read_stats() or None)
