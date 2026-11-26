"""`ci` command line: run stages individually or the whole pipeline.

    ci collect | process | categorise | analyse | recommend | build-ui | run | demo
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from . import config, io


def _p(key: str, name: str) -> Path:
    return config.path(key) / name


def cmd_collect(a):
    from .collect import collect_all
    from .collect import store
    since = date.fromisoformat(a.since) if a.since else None
    existing = store.load_store() if getattr(a, "incremental", False) else None
    if existing is not None and since is None:
        since = store.since_from_store(existing)
        print(f"[collect] incremental: store has {len(existing)} rows, collecting since {since}")
    df = collect_all(a.source, since)
    if existing is not None or getattr(a, "incremental", False):
        df, added = store.merge(existing, df)
        print(f"[collect] +{added} new rows (store now {len(df)})")
    out = _p("raw", f"comments_{date.today().isoformat()}.csv")
    io.write(df, out)
    print(f"[collect] {len(df)} rows -> {out}")


def _latest(key: str, pattern: str) -> Path:
    files = sorted(config.path(key).glob(pattern))
    if not files:
        sys.exit(f"No {pattern} in {config.path(key)} - run the previous stage first.")
    return files[-1]


def cmd_process(a):
    from .process import process_df
    src = Path(a.input) if a.input else _latest("raw", "comments_*.csv")
    out = _p("interim", "comments_clean.csv")
    io.write(process_df(io.read(src)), out)
    print(f"[process] {src.name} -> {out}")


def cmd_categorise(a):
    from .categorise import categorise_df
    df = io.read(a.input or _p("interim", "comments_clean.csv"))
    out = _p("processed", "comments_categorised.csv")
    io.write(categorise_df(df, a.mode), out)
    print(f"[categorise] -> {out}")


def cmd_analyse(a):
    from .analyse import analyse_df
    analyse_df(io.read(a.input or _p("processed", "comments_categorised.csv")))


def cmd_recommend(a):
    from .analyse.metrics import Metrics
    from .recommend import jira
    from .recommend.backlog import build_backlog, write_backlog
    m = Metrics(io.read(a.input or _p("processed", "comments_categorised.csv")))
    items = build_backlog(m, a.segment, mobile_only=not a.all_areas, limit=a.limit)
    if config.settings()["recommend"]["llm_refine"] or a.llm:
        from .recommend.llm import refine
        items = refine(items)
    write_backlog(items)
    jira.write_exports(items)
    if a.push:
        jira.push(items, dry_run=False)


def cmd_build_ui(a):
    from .ui import build_ui
    build_ui(io.read(a.input or _p("processed", "comments_categorised.csv")), a.out, cdn=a.cdn)


def cmd_run(a):
    if not a.skip_collect:
        cmd_collect(argparse.Namespace(source=a.source, since=a.since, incremental=a.incremental))
    from .pipeline import run_downstream
    run_downstream(a.mode)


def cmd_export_workbook(a):
    from .export_workbook import export_workbook
    raw = io.read(a.input) if a.input else io.read(_latest("raw", "comments_*.csv"))
    for bank in a.bank or sorted(raw["bank"].unique()):
        stem = {"CBA": "commbank"}.get(bank, bank.lower())          # same file names as data/input
        export_workbook(raw, bank, Path(a.out_dir) / f"{stem}-user-comments.xlsx")


def cmd_serve(a):
    try:
        import uvicorn
    except ImportError:
        sys.exit('Install the API extras first: pip install -e ".[api]"')
    uvicorn.run("ci.api.app:app", factory=True, host=a.host, port=a.port, reload=False)


def cmd_demo(a):
    """Offline end-to-end run on the bundled sample file (no credentials needed)."""
    cmd_run(argparse.Namespace(skip_collect=False, source=["File drop (CSV/XLSX/JSON)"], since=None, incremental=False, mode="rules"))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="ci", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", action="append", metavar="KEY=VALUE", help="override a settings.yaml value, e.g. --set analysis.min_n_area=5")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("collect", help="pull feedback from enabled sources"); s.add_argument("--source", nargs="*"); s.add_argument("--since"); s.add_argument("--incremental", action="store_true", help="merge into the latest raw store; default --since = newest stored date minus overlap"); s.set_defaults(f=cmd_collect)
    s = sub.add_parser("process", help="clean, redact PII, de-duplicate"); s.add_argument("--input"); s.set_defaults(f=cmd_process)
    s = sub.add_parser("categorise", help="area + segment + sentiment"); s.add_argument("--input"); s.add_argument("--mode", choices=["rules", "llm", "hybrid"]); s.set_defaults(f=cmd_categorise)
    s = sub.add_parser("analyse", help="scorecards, trends, insights"); s.add_argument("--input"); s.set_defaults(f=cmd_analyse)
    s = sub.add_parser("recommend", help="backlog + Jira exports"); s.add_argument("--input"); s.add_argument("--segment", default="all", choices=["all", "Business", "Personal", "General", "BG"])
    s.add_argument("--all-areas", action="store_true"); s.add_argument("--limit", type=int); s.add_argument("--llm", action="store_true"); s.add_argument("--push", action="store_true", help="really create Jira issues"); s.set_defaults(f=cmd_recommend)
    s = sub.add_parser("build-ui", help="write dist/index.html"); s.add_argument("--input"); s.add_argument("--out"); s.add_argument("--cdn", action="store_true", help="load Chart.js/SheetJS from CDN instead of inlining"); s.set_defaults(f=cmd_build_ui)
    s = sub.add_parser("run", help="all stages"); s.add_argument("--skip-collect", action="store_true"); s.add_argument("--source", nargs="*"); s.add_argument("--since"); s.add_argument("--incremental", action="store_true"); s.add_argument("--mode", choices=["rules", "llm", "hybrid"]); s.set_defaults(f=cmd_run)
    s = sub.add_parser("export-workbook", help="write raw comments per bank to the six-column Excel format"); s.add_argument("--input"); s.add_argument("--bank", nargs="*"); s.add_argument("--out-dir", default="data/input"); s.set_defaults(f=cmd_export_workbook)
    s = sub.add_parser("serve", help="start the HTTP API (backlog / ingest / jira push)"); s.add_argument("--host", default="127.0.0.1"); s.add_argument("--port", type=int, default=8000); s.set_defaults(f=cmd_serve)
    s = sub.add_parser("demo", help="offline end-to-end on bundled sample data"); s.set_defaults(f=cmd_demo)
    a = ap.parse_args(argv)
    config.override(a.set)
    a.f(a)


if __name__ == "__main__":
    main()
