#!/usr/bin/env python3
"""STEP 2 - DATA PROCESSING.   input: data/raw/comments_*.csv (newest)   output: data/interim/comments_clean.csv

Strips HTML/URLs, normalises text, redacts PII (email, phone, card, BSB/account, TFN, CRN), hashes author handles,
and (profile "analysis" only) drops very short rows / exact duplicates and truncates long text. Writes data/interim/process_stats.json (used by the workbook's Method tab).

  python pipeline/02_process.py                        # profile "archive": keep every comment (this is what the analysed workbook uses)
  python pipeline/02_process.py --profile analysis     # dashboard-grade filtering from settings.yaml (min_chars, max_chars, drop_duplicates)
  python pipeline/02_process.py --set processing.hash_authors=false     # keep UserIDs as collected (internal use only)
"""
import json

from _common import config, io, latest_raw, parser, path, start, stats_path

ap = parser(__doc__)
ap.add_argument("--input", help="raw CSV (default: newest data/raw/comments_*.csv)")
ap.add_argument("--out", help="default data/interim/comments_clean.csv")
ap.add_argument("--profile", choices=["archive", "analysis"], default="archive",
                help="archive = keep all rows and full text (reproduces the original workbook); analysis = apply settings.yaml length/duplicate rules")
a = start(ap)
if a.profile == "archive":
    config.override(["processing.min_chars=1", "processing.min_chars_rated=1", "processing.max_chars=1000000", "processing.drop_duplicates=false"])

from ci.process import process_df  # noqa: E402

src = a.input or latest_raw()
raw = io.read(src)
clean = process_df(raw.copy())
out = a.out or path("interim", "comments_clean.csv")
io.write(clean, out)
stats_path().write_text(json.dumps({"raw_rows": len(raw), "clean_rows": len(clean), "pii_redacted": int(clean["pii_redacted"].sum()),
                                    "dropped": len(raw) - len(clean), "source_file": str(src),
                                    "profile": a.profile, **{k: config.settings()["processing"][k] for k in ("min_chars", "min_chars_rated", "max_chars", "drop_duplicates", "hash_authors")}}, indent=1))
print(f"[process] [{a.profile}] {len(raw):,} raw -> {len(clean):,} clean ({len(raw) - len(clean):,} dropped as empty/undated" + (" /short/duplicate" if a.profile == "analysis" else "") + f") -> {out}")
