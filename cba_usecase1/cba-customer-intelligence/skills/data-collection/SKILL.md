---
name: data-collection
description: Use when the user wants to pull or import customer feedback (Google Play, App Store, Reddit, ServiceNow, files) or add a new feedback channel.
---
# Data collection

## Purpose
Gather raw customer feedback from every channel into one uniform table, without interpreting or filtering it.

## Inputs
- `config/sources.yaml` (one entry per channel: `collector`, `bank`, `params`, `enabled`)
- Credentials in `.env` for Reddit / ServiceNow (never prompt for or print secrets)
- Optional `--since YYYY-MM-DD`

## Outputs
`data/raw/comments_<date>.csv` with columns `id, bank, source, channel, date, rating, text, author, url, meta`
(contract: `docs/data-contract.md`, class `RawComment` in `src/ci/schema.py`).

## Procedure
1. Open `config/sources.yaml`; list enabled sources back to the user.
2. For file exports (CSV/XLSX/JSON) use `collector: file_import` and map columns under `params.columns`.
3. Run `ci collect` (all enabled) or `ci collect --source "Google Play (CBA)"`.
4. Read the console summary; a source that fails must not abort the others.
5. Open the output and spot-check 10 rows: date is ISO, rating is 1-5 or empty, text is not HTML.

## Quality gates
- [ ] Every row has `bank`, `source`, `date`, non-empty `text`.
- [ ] Row counts per source are plausible vs. the last run.
- [ ] No credentials or personal identifiers were written to `data/` beyond `author` (hashed in the next stage).

## Prompts used
None.

## Failure modes
- Rate limiting / 429: re-run with a smaller `count`/`limit`; collectors are idempotent because processing de-duplicates.
- Apple RSS returns few pages: expected; use the vendor export for history.
- ServiceNow returns HTML: wrong table name or auth; check `SERVICENOW_*`.

## Extending - add a channel
1. Create `src/ci/collect/<name>.py` with `class XCollector(Collector)` implementing `fetch(since)` and yielding `RawComment`.
2. Register it in `COLLECTORS` in `src/ci/collect/registry.py`.
3. Add a `sources.yaml` entry and a test in `tests/test_collect.py` using a recorded fixture.
