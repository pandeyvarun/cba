#!/usr/bin/env python3
"""Run the five steps in order (each one is also a standalone script).

  01_collect.py -> 02_process.py -> 03_categorise.py -> 04_enrich.py -> 05_build_workbook.py

  python pipeline/run_all.py --preset workbooks              # historical dataset -> data/reports/commbank-user-comments-analysed.xlsx
  python pipeline/run_all.py --preset public --mode hybrid   # live public channels, Claude on ambiguous rows
  python pipeline/run_all.py --from-step 3                   # re-run categorise -> workbook on existing files
  python pipeline/run_all.py --preset workbooks --to-step 2  # stop after processing
"""
import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["01_collect.py", "02_process.py", "03_categorise.py", "04_enrich.py", "05_build_workbook.py"]

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--from-step", type=int, default=1, choices=range(1, 6))
ap.add_argument("--to-step", type=int, default=5, choices=range(1, 6))
ap.add_argument("--preset", choices=["workbooks", "public", "enabled"], default="workbooks", help="step 1 sources (default: the historical workbooks)")
ap.add_argument("--source", nargs="*", help="step 1: explicit source names")
ap.add_argument("--since", help="step 1: only items on/after this date")
ap.add_argument("--incremental", action="store_true", help="step 1: merge into the existing raw file")
ap.add_argument("--profile", choices=["archive", "analysis"], help="step 2 processing profile (default archive: keep every comment)")
ap.add_argument("--mode", choices=["rules", "llm", "hybrid"], help="step 3 labelling mode")
ap.add_argument("--set", action="append", metavar="KEY=VALUE", help="settings override passed to every step")
a = ap.parse_args()

common = [x for kv in (a.set or []) for x in ("--set", kv)]
extra = {
    1: (["--source", *a.source] if a.source else ["--preset", a.preset]) + (["--since", a.since] if a.since else []) + (["--incremental"] if a.incremental else []),
    2: ["--profile", a.profile] if a.profile else [],
    3: ["--mode", a.mode] if a.mode else [],
}
for n in range(a.from_step, a.to_step + 1):
    script = STEPS[n - 1]
    print(f"\n=== STEP {n}: {script} ===", flush=True)
    r = subprocess.run([sys.executable, str(HERE / script), *common, *extra.get(n, [])])
    if r.returncode:
        sys.exit(f"Step {n} ({script}) failed with exit code {r.returncode}")
print("\nDone.")
