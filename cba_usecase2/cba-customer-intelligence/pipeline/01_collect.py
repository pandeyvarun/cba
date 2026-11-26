#!/usr/bin/env python3
"""STEP 1 - DATA COLLECTION.   input: config/sources.yaml (+ credentials in .env)   output: data/raw/comments_<date>.csv

Pulls customer feedback for CBA and the competitors from the configured channels (App Store, Google Play, Reddit archive,
Hacker News, ServiceNow, any CSV/XLSX/JSON). One failing source never stops the others. Output columns: see docs/data-contract.md.

  python pipeline/01_collect.py --preset workbooks          # the historical dataset in data/input (offline, reproducible)
  python pipeline/01_collect.py --preset public             # every credential-free live channel (App Store, Google Play, Reddit archive, Hacker News)
  python pipeline/01_collect.py --source "Hacker News (CBA)" "Apple App Store (NAB)"
  python pipeline/01_collect.py                             # sources with enabled: true in sources.yaml
  python pipeline/01_collect.py --preset public --incremental   # merge new rows into the existing raw file (de-duplicated)
"""
from datetime import date

from _common import PUBLIC_COLLECTORS, WORKBOOK_SOURCES, config, io, parser, path, start

ap = parser(__doc__)
ap.add_argument("--preset", choices=["workbooks", "public", "enabled"], default="enabled")
ap.add_argument("--source", nargs="*", help="explicit source names from sources.yaml (overrides --preset)")
ap.add_argument("--since", help="only items on/after this date (YYYY-MM-DD)")
ap.add_argument("--incremental", action="store_true", help="merge into the newest raw file; --since defaults to newest stored date minus overlap")
ap.add_argument("--out", help="output CSV (default data/raw/comments_<today>.csv)")
a = start(ap)

from ci.collect import collect_all, store  # noqa: E402

names = a.source
if not names and a.preset == "workbooks":
    names = WORKBOOK_SOURCES
elif not names and a.preset == "public":
    names = [e["name"] for e in config.sources_config() if e["collector"] in PUBLIC_COLLECTORS]

since = date.fromisoformat(a.since) if a.since else None
existing = store.load_store() if a.incremental else None
if existing is not None and since is None:
    since = store.since_from_store(existing)
    print(f"[collect] incremental: store has {len(existing):,} rows, collecting since {since}")

df = collect_all(names, since)
if a.incremental:
    df, added = store.merge(existing, df)
    print(f"[collect] +{added:,} new rows (store now {len(df):,})")
if df.empty:
    raise SystemExit("[collect] no rows collected - check source names / network / credentials")

out = path("raw", f"comments_{date.today().isoformat()}.csv") if not a.out else __import__("pathlib").Path(a.out)
io.write(df, out)
print(f"[collect] {len(df):,} rows -> {out}")
print(df.groupby(["bank", "source"]).size().rename("rows").to_string())
for name, err in df.attrs.get("errors", []):
    print(f"[collect] WARNING {name} failed: {err}")
