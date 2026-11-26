# Known limitations and suggested next work for Cursor

## Done in the Cursor build session (2026-11-24)
- Data collection rebuilt: `hackernews` collector (public API, verified live), App Store IDs for NAB / Westpac / ANZ Australia / ANZ Plus (verified via Apple's search API), Google Play NAB (`au.com.nab.mobile`, verified). `ci export-workbook` writes the original six-column format; round-trip against the four `data/input` workbooks is exact.
- #1 (partly): golden set grown 20 -> 107 rows; area accuracy 1.00 / sentiment 0.88 / segment 0.88 on it. It was *tuned against*, so treat as a regression gate, not an unbiased estimate - add fresh rows from real data. Enforced by `tests/test_eval_gate.py`.
- The three known misses fixed (statement download vs loans, PayID/crypto block vs payments, "fast and reliable" praise) plus gaps found while labelling (missing/disappeared money, business-feature vocabulary).
- #9 (partly): recorded-fixture tests for App Store, ServiceNow, Google Play, Reddit (`tests/test_collectors_fixtures.py`) and a mocked Jira bulk push. Still **not** run against real services.
- #10: FastAPI backend `src/ci/api/` (`ci serve`): `/backlog`, `/ingest`, `/pipeline/run`, `/jira/push` (dry-run default, API key, second opt-in for real writes).
- #11: UI `TITLES`/`EFFORT`/`NOMOBILE` are injected from `playbook.json` (`export_data.py`), no longer hard-coded.
- #13: Chart.js + SheetJS vendored in `src/ci/ui/vendor/` and inlined (`ui.vendor_assets`). The Inter web font still loads from Google Fonts and falls back to the system font offline.
- #14: `ci collect|run --incremental` with cross-run dedupe store; GitHub Actions `ci.yml` and weekly `scheduled-run.yml`.
- Bug fixes: `backlog.json` wrote invalid `NaN` for `best_rival` when an area had no peer data (now `null`, strict JSON); pandas dtype warning in `process/clean.py`.
- Regression check: against the original `artifacts/tagged-data/tagged_cba.csv` (9,163 comments matched on source/date/text) the pipeline agrees on 99.4% secondary area / 99.7% primary area / 99.2% sentiment / 100% account type.
- Processing rule changed: star-rated reviews are no longer dropped for being short (`processing.min_chars_rated: 1`; 396 CBA reviews such as "Love it" were being lost) and the duplicate key now includes the user. `make full` therefore keeps 20,628 rows (CBA 10,242) instead of 19,438 (CBA 9,854). Set `min_chars_rated: 12` to restore the old rule.
- New: `pipeline/` step scripts and `src/ci/report/` (enrich + workbook) build `commbank-user-comments-analysed.xlsx`.

## Still open (below is the original list; items above are resolved or partly resolved)

## Quality
1. Rules are directional: golden-set area accuracy 0.85 (n=20 only). Grow `evals/classification_golden.jsonl` to 200+ labelled rows and track accuracy in CI.
2. Multi-topic comments take only the strongest area; sarcasm and advice-thread replies skew Reddit sentiment (use `prompts/sentiment_target.md` or hybrid mode).
3. Business/Profile/Two-factor/Corporate keywords (user-specified) still over-tag some personal users; consider an LLM check (`prompts/segment_account.md`) for Business rows.
4. Source mix is uneven (Reddit spikes Oct-Nov 2026); add per-source filters to scorecards/UI before drawing trend conclusions.
5. Competitor text in `playbook.json` was written by reading samples, not every comment. Regenerate with `prompts/area_summary.md` + stats if you want it reproducible.

## Evidence gaps
6. Westpac mobile features come from NZ index pages (titles only). Replace with Westpac Australia help pages when available (`prompts/competitor_features.md`).
7. NAB Connect guide is from 2018; re-check current business app capabilities.
8. CBA's own app feature list was never provided - suggestions are ideas, not confirmed gaps. Add `config/cba_features.json` and diff against the matrix.

## Engineering
9. LLM paths, live collectors (Google Play, App Store, Reddit, ServiceNow) and Jira push were not run against real services (no credentials in the build environment). Add recorded-fixture tests, then smoke-test with real keys.
10. The web app is static: Jira/ServiceNow need a small backend proxy (token storage, CORS). Suggested: FastAPI service exposing `/backlog`, `/jira/push`, `/ingest`.
11. UI constants `TITLES`/`EFFORT` are hard-coded in `templates/app.js`; inject them from `playbook.json` in `export_data.py`.
12. The UI template carries a JS port of the classifier; keep it in sync with Python (patterns come from `taxonomy.json`).
13. Replace CDN scripts (Chart.js, SheetJS) with vendored copies for offline/air-gapped hosting.
14. Add scheduled runs (GitHub Actions / cron), incremental collection (`--since`) and a dedupe store across runs.

## Quick first tasks for an agent
- Run `make demo`, `make test`, `make eval`; then `ci run --source "Workbook CBA" "Workbook ANZ" "Workbook NAB" "Workbook Westpac"` and compare to the workbook.
- Add fresh, independently labelled golden rows from real data (the current 107 were tuned against); consider the sentiment (0.88) and segment (0.88) misses next.
