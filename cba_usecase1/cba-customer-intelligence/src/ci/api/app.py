"""FastAPI service. Endpoints:

    GET  /health                      liveness + data freshness (no auth)
    GET  /backlog?segment=&limit=     prioritised backlog from the latest categorised data (no auth, read-only)
    POST /ingest                      append feedback rows to the raw store (X-API-Key)
    POST /pipeline/run                re-run process -> UI on the raw store (X-API-Key)
    POST /jira/push                   create Jira issues - DRY RUN unless dry_run=false AND CI_ALLOW_JIRA_PUSH=1 (X-API-Key)

Safety: tokens live in the server environment only (never in requests/responses); mutating endpoints need
`CI_API_KEY` to be configured and sent as `X-API-Key`; real Jira writes need an explicit second opt-in.
"""
from __future__ import annotations

import hmac
import os
from datetime import date
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .. import config, io

Segment = Literal["all", "Business", "Personal", "General", "BG"]


class FeedbackRow(BaseModel):
    bank: str
    text: str = Field(min_length=1, max_length=5000)
    date: str | None = None                      # ISO date; default today
    source: str = "API"
    rating: int | None = Field(default=None, ge=1, le=5)
    id: str = ""


class IngestRequest(BaseModel):
    rows: list[FeedbackRow] = Field(min_length=1, max_length=5000)
    run_pipeline: bool = False


class PushRequest(BaseModel):
    segment: Segment = "all"
    limit: int | None = Field(default=None, ge=1, le=100)
    areas: list[str] | None = None                # push only these backlog areas (default all)
    dry_run: bool = True


def require_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("CI_API_KEY")
    if not expected:
        raise HTTPException(503, "CI_API_KEY is not configured on the server; mutating endpoints are disabled.")
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(401, "Invalid or missing X-API-Key.")


def _categorised():
    p = config.path("processed") / "comments_categorised.csv"
    if not p.exists():
        raise HTTPException(404, "No categorised data yet - POST /ingest (run_pipeline) or run `ci run` first.")
    return io.read(p)


def _backlog(segment: str, limit: int | None) -> list[dict]:
    from ..analyse.metrics import Metrics
    from ..recommend.backlog import build_backlog
    return build_backlog(Metrics(_categorised()), segment, limit=limit)


def create_app() -> FastAPI:
    config.load_env()
    app = FastAPI(title="CBA Customer Intelligence API", version="0.1.0")
    origins = [o.strip() for o in os.environ.get("CI_CORS_ORIGINS", "").split(",") if o.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["X-API-Key", "Content-Type"])

    @app.get("/health")
    def health():
        p = config.path("processed") / "comments_categorised.csv"
        return {"status": "ok", "categorised_rows_file": p.exists(),
                "jira_dry_run_default": bool(config.settings()["jira"]["dry_run"]),
                "mutations_enabled": bool(os.environ.get("CI_API_KEY"))}

    @app.get("/backlog")
    def backlog(segment: Segment = "all", limit: int | None = Query(default=None, ge=1, le=100)):
        items = _backlog(segment, limit)
        return {"segment": segment, "count": len(items), "items": items}

    @app.post("/ingest", dependencies=[Depends(require_key)])
    def ingest(req: IngestRequest):
        import pandas as pd

        from ..collect import store
        from ..schema import RAW_COLUMNS
        today = date.today().isoformat()
        banks = set(config.settings()["banks"])
        bad = sorted({r.bank for r in req.rows} - banks)
        if bad:
            raise HTTPException(422, f"Unknown bank(s) {bad}; allowed: {sorted(banks)}")
        new = pd.DataFrame([{"id": r.id, "bank": r.bank, "source": r.source, "channel": "api", "date": (r.date or today)[:10],
                             "rating": r.rating, "text": r.text, "author": "", "url": "", "meta": ""} for r in req.rows], columns=RAW_COLUMNS)
        merged, added = store.merge(store.load_store(), new)
        out = store.save_store(merged)
        res = {"received": len(req.rows), "added": added, "duplicates_skipped": len(req.rows) - added, "store": out.name, "store_rows": len(merged)}
        if req.run_pipeline:
            from ..pipeline import run_downstream
            res["pipeline"] = run_downstream()
        return res

    @app.post("/pipeline/run", dependencies=[Depends(require_key)])
    def run_pipeline():
        from ..pipeline import run_downstream
        try:
            return run_downstream()
        except FileNotFoundError as e:
            raise HTTPException(404, str(e)) from e

    @app.post("/jira/push", dependencies=[Depends(require_key)])
    def jira_push(req: PushRequest):
        from ..recommend import jira
        items = _backlog(req.segment, req.limit)
        if req.areas:
            items = [i for i in items if i["area"] in set(req.areas)]
        if not items:
            raise HTTPException(404, "No backlog items matched.")
        dry = req.dry_run
        if not dry and os.environ.get("CI_ALLOW_JIRA_PUSH") != "1":
            raise HTTPException(403, "Real Jira push is disabled. Set CI_ALLOW_JIRA_PUSH=1 on the server and send dry_run=false.")
        if not dry and not all(os.environ.get(k) for k in ("JIRA_SITE", "JIRA_EMAIL", "JIRA_API_TOKEN")):
            raise HTTPException(400, "Jira credentials are not configured on the server.")
        res = jira.push(items, dry_run=dry)
        res["summaries"] = [i["summary"] for i in items]
        return res

    return app


app = create_app
