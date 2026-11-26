"""Shared helpers for the step scripts: make `ci` importable without installing, standard paths and arguments."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
os.environ.setdefault("CI_ROOT", str(ROOT))

from ci import config, io  # noqa: E402,F401  (re-exported for the step scripts)

WORKBOOK_SOURCES = ["Workbook CBA", "Workbook ANZ", "Workbook NAB", "Workbook Westpac"]
PUBLIC_COLLECTORS = {"app_store", "google_play", "hackernews", "reddit_archive"}     # no credentials needed


def parser(description: str) -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=description, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", action="append", metavar="KEY=VALUE", help="override a settings.yaml value, e.g. --set processing.hash_authors=false")
    return ap


def start(ap: argparse.ArgumentParser) -> argparse.Namespace:
    a = ap.parse_args()
    config.override(a.set)
    return a


def path(key: str, name: str) -> Path:
    return config.path(key) / name


def latest_raw() -> Path:
    files = sorted(config.path("raw").glob("comments_*.csv"))
    if not files:
        sys.exit(f"No comments_*.csv in {config.path('raw')} - run pipeline/01_collect.py first.")
    return files[-1]


def need(p: Path, step: str) -> Path:
    if not p.exists():
        sys.exit(f"Missing {p} - run {step} first.")
    return p


def stats_path() -> Path:
    return path("interim", "process_stats.json")


def read_stats() -> dict:
    p = stats_path()
    return json.loads(p.read_text()) if p.exists() else {}
