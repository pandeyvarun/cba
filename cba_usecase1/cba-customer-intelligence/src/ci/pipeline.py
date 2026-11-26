"""Programmatic entry points shared by the CLI and the API (process -> ... -> UI on an existing raw file)."""
from __future__ import annotations

from pathlib import Path

from . import config, io


def latest_raw() -> Path:
    files = sorted(config.path("raw").glob("comments_*.csv"))
    if not files:
        raise FileNotFoundError(f"No comments_*.csv in {config.path('raw')} - collect or ingest first.")
    return files[-1]


def run_downstream(mode: str | None = None, build_ui: bool = True) -> dict:
    """process -> categorise -> analyse -> recommend -> (UI) from the newest raw file. Returns a small summary."""
    from .analyse import analyse_df
    from .analyse.metrics import Metrics
    from .categorise import categorise_df
    from .process import process_df
    from .recommend import jira
    from .recommend.backlog import build_backlog, write_backlog

    clean = process_df(io.read(latest_raw()))
    io.write(clean, config.path("interim") / "comments_clean.csv")
    cat = categorise_df(clean, mode)
    io.write(cat, config.path("processed") / "comments_categorised.csv")
    analyse_df(cat)
    items = build_backlog(Metrics(cat), "all")
    if config.settings()["recommend"]["llm_refine"]:
        from .recommend.llm import refine
        items = refine(items)
    write_backlog(items)
    jira.write_exports(items)
    ui = None
    if build_ui:
        from .ui import build_ui as _build
        ui = str(_build(cat))
    return {"rows": int(len(cat)), "backlog_items": len(items), "ui": ui}
