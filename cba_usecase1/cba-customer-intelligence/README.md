# CBA Customer Intelligence

An end-to-end, modular pipeline that turns customer feedback from the **App Store, Google Play, Reddit, ServiceNow and any file**
into **competitor intelligence, a prioritised mobile-app backlog (Jira-ready) and an interactive dashboard** for Banking Portfolio
Leads and App Product Owners.

```
collect -> process -> categorise -> analyse -> recommend -> UI
 raw        clean      area/segment   scorecards   backlog     dist/index.html
 CSV        + PII      /sentiment     insights     + Jira
            redaction  (rules/Claude)
```

## Quick start (offline, no credentials)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
make demo            # sample data -> data/reports/* and dist/index.html
make test            # 47 tests: unit, collector fixtures, API, eval gate, offline end-to-end
make eval            # categoriser accuracy on the golden set
open dist/index.html
```

## Step-by-step pipeline (collection -> analysed workbook)

The same flow as separate, individually runnable scripts in `pipeline/`. Each reads the previous step's file and writes the next one:

| Step | Script | Reads | Writes |
|---|---|---|---|
| 1 Collect | `pipeline/01_collect.py` | `config/sources.yaml` | `data/raw/comments_<date>.csv` |
| 2 Process | `pipeline/02_process.py` | newest raw CSV | `data/interim/comments_clean.csv`, `process_stats.json` |
| 3 Categorise | `pipeline/03_categorise.py` | clean CSV | `data/processed/comments_categorised.csv` |
| 4 Enrich | `pipeline/04_enrich.py` | categorised CSV | `data/processed/comments_enriched.csv` (adds improvement + competitor text) |
| 5 Workbook | `pipeline/05_build_workbook.py` | enriched CSV | `data/reports/commbank-user-comments-analysed.xlsx` (7 tabs) |

```bash
make workbook                                   # all five, from the historical workbooks in data/input
python pipeline/run_all.py --preset public      # step 1 from the live public sources (Play, App Store, Reddit archive, HN)
python pipeline/run_all.py --from-step 3        # re-run from categorisation onwards
python pipeline/03_categorise.py --mode hybrid  # any step on its own
```

Step 2 has two profiles. `archive` (default) keeps every comment and its full text, which reproduces the original workbook (10,404 of its 10,413 CBA rows; the other 9 are emoji/URL-only and have no text left after cleaning). `analysis` applies the `settings.yaml` length/duplicate rules the dashboard uses (`make full`, 10,242 CBA rows). PII is redacted and UserIDs hashed in both.

## Data collection

Every channel is a collector in `src/ci/collect/`, configured in `config/sources.yaml`:

| Channel | Collector | Needs | Status in `sources.yaml` |
|---|---|---|---|
| Apple App Store (CBA, NAB, Westpac, ANZ Australia, ANZ Plus) | `app_store` | nothing (public RSS) | CBA enabled; others verified IDs, disabled |
| Google Play (CBA, ANZ, NAB) | `google_play` | `pip install -e ".[collect]"` | CBA enabled; others disabled |
| Hacker News (all banks) | `hackernews` | nothing (public Algolia API) | disabled |
| Reddit | `reddit` | `REDDIT_CLIENT_ID/SECRET` | disabled |
| ServiceNow | `servicenow` | read-only service account | disabled |
| Any CSV/XLSX/JSON | `file_import` | a file | the four `Workbook <bank>` entries (the historical dataset in `data/input/`) |

```bash
python -m ci collect --source "Hacker News (CBA)" "Apple App Store (NAB)"   # one-off pull
python -m ci collect --incremental                                         # merge into the raw store (see below)
python -m ci export-workbook --out-dir exports/                            # raw store -> six-column Excel per bank
```

`export-workbook` writes `Source, UserID, Date, Comment, Reply, Rating` - the format of the original `data/input/` workbooks - and round-trips exactly (verified in `tests/test_export_workbook.py`).
Note: a plain `ci collect` overwrites today's `data/raw/comments_<date>.csv`; use `--incremental` to keep earlier data.
Not yet verified: Google Play packages for Westpac and ANZ Plus, and ProductReview.com.au (no stable public API). Add them to `sources.yaml` once confirmed.

## Live data

```bash
cp .env.example .env                       # add only the credentials you use
# edit config/sources.yaml  (enabled: true for the channels you want)
python -m ci run --mode hybrid             # collect -> ... -> dist/index.html
python -m ci recommend --segment Business  # backlog for one segment (dry-run Jira export)
```

Incremental / scheduled: `python -m ci run --incremental` merges new rows into the latest `data/raw/comments_*.csv`
(de-duplicated; `--since` defaults to the newest stored date minus `collect.overlap_days`). `.github/workflows/scheduled-run.yml` runs this weekly.

Single stages: `ci collect | process | categorise | analyse | recommend | build-ui`. Override settings: `--set analysis.min_n_area=5`.

## HTTP API (backlog, ingest, Jira push)

```bash
pip install -e ".[api]"; make serve            # http://127.0.0.1:8000/docs
```

| Endpoint | Auth | Does |
|---|---|---|
| `GET /health` | none | liveness, whether mutations are enabled |
| `GET /backlog?segment=&limit=` | none | prioritised backlog from the latest categorised data |
| `POST /ingest` | `X-API-Key` | append feedback rows (de-duplicated); `run_pipeline: true` re-runs process -> UI |
| `POST /pipeline/run` | `X-API-Key` | re-run process -> UI on the raw store |
| `POST /jira/push` | `X-API-Key` | **dry run by default**; real push needs `dry_run=false` **and** `CI_ALLOW_JIRA_PUSH=1` **and** `JIRA_*` env on the server |

POST endpoints are disabled until `CI_API_KEY` is set. Tokens stay in the server environment; they are never accepted from or returned to clients.
Set `CI_CORS_ORIGINS` to let a hosted web app call the API.

## Use it with Claude Code

```bash
make link-skills     # exposes ./skills as .claude/skills
claude               # then: "/run-pipeline hybrid --since 2026-10-01"
```

| Slash command | Does |
|---|---|
| `/run-pipeline [mode] [--since]` | runs the orchestrator skill with quality gates |
| `/add-source <name>` | scaffolds a collector + config + test |
| `/add-category <name>` | safe taxonomy change with eval before/after |
| `/export-backlog [segment]` | backlog + Jira CSV (dry run) |

`CLAUDE.md` holds the project rules and module map; `.claude/settings.json` allows safe commands and **blocks reading `.env` and pushing to Jira**.

## Repository layout

```
config/        settings.yaml, sources.yaml, taxonomy.json, segments.json, playbook.json, competitor_features.json
prompts/       LLM prompt templates (categorise, segment, sentiment, features, summaries, recommendations, Jira, briefing)
skills/        skill specifications (SKILL.md per stage + orchestrator + template)
pipeline/      step scripts 01_collect ... 05_build_workbook + run_all
src/ci/        collect/ report/ process/ categorise/ analyse/ recommend/ llm/ ui/ api/ (+ cli.py, pipeline.py, config.py, schema.py)
evals/         golden labelled examples for the categoriser
tests/         unit + offline end-to-end tests
docs/          architecture.md, data-contract.md
data/          raw -> interim -> processed -> reports (git-ignored) + sample/
dist/          generated web app
.claude/       Claude Code settings and slash commands
.github/       CI (tests + demo) and a weekly scheduled incremental run
```

## Modules at a glance

| Stage | Entry point | Key idea |
|---|---|---|
| Collect | `ci.collect.registry.collect_all` | one `Collector` per channel, failures isolated |
| Process | `ci.process.process_df` | HTML/URL strip, PII redaction, dedupe, author hash |
| Categorise | `ci.categorise.categorise_df` | rules (free) -> Claude for ambiguous rows (`hybrid`) |
| Analyse | `ci.analyse.analyse_df` | neg/pos %, competitor gap, momentum, priority score, insights |
| Recommend | `ci.recommend.backlog.build_backlog` | playbook + evidence -> backlog; Jira CSV/JSON/push (guarded) |
| UI | `ci.ui.build_app.build_ui` | one self-contained HTML (CBA yellow, light/dark) |

## Safety and limits
- PII is redacted before analysis; `.env` and `data/raw` are never committed.
- Jira push is **dry-run by default**; the web app never stores API tokens.
- Rule-based tagging is directional: expect misclassification (see `make eval`). Competitor claims come from official pages; Westpac NZ pages are indicative.
- Sample sizes differ by bank and channel - always report segment, period and n.
