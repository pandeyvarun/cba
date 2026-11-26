# AGENTS.md - guide for AI coding agents (Cursor, Claude Code, Codex)

**Read first:** `docs/context/CHAT_HISTORY.md` (why things exist), `docs/context/REQUIREMENTS_AND_RULES.md` (the spec),
`docs/context/OPEN_ITEMS.md` (what to do next), `docs/architecture.md`, `docs/data-contract.md`.

## What this is
End-to-end pipeline that turns public customer feedback (app stores, Reddit, ServiceNow, files) for CBA and competitors (ANZ, NAB, Westpac)
into competitor intelligence, a prioritised mobile-app backlog (Jira-ready) and an interactive CBA-yellow dashboard.

## Commands
```
pip install -e ".[dev]"
make demo      # offline end-to-end on data/sample -> dist/index.html
make test      # 47 tests (unit, collector fixtures, API, golden-set gate, offline e2e)
make full      # full 20,967-row historical dataset -> dist/index.html
make serve     # HTTP API (backlog / ingest / guarded Jira push); needs pip install -e ".[api]"
make workbook  # step scripts pipeline/01..05 -> data/reports/commbank-user-comments-analysed.xlsx
make eval      # categoriser accuracy on evals/classification_golden.jsonl
python -m ci run --source "Workbook CBA" "Workbook ANZ" "Workbook NAB" "Workbook Westpac" --mode rules   # full 20,967-row dataset
python -m ci <collect|process|categorise|analyse|recommend|build-ui|run|demo> --help
```

## Map
collect `src/ci/collect/` -> process `src/ci/process/` -> categorise `src/ci/categorise/` -> analyse `src/ci/analyse/` -> recommend `src/ci/recommend/` -> UI `src/ci/ui/` (+ `templates/`).
API in `src/ci/api/`; shared programmatic pipeline in `src/ci/pipeline.py`; incremental store in `src/ci/collect/store.py`.
Config in `config/` (taxonomy.json, segments.json, playbook.json, competitor_features.json, settings.yaml, sources.yaml). LLM prompts in `prompts/`. Skill specs in `skills/`.

## Non-negotiable rules
1. Numbers are computed in code, never by an LLM. LLMs label, summarise, draft.
2. Stages communicate through files (`data/raw -> interim -> processed -> reports -> dist`).
3. Never read/print `.env`; never commit `data/raw`, `data/input`, credentials or un-redacted text.
4. No live side effects without explicit approval: collectors with credentials stay `enabled: false`; Jira push stays dry-run (`jira.dry_run: true`).
5. Prompt changes: update the golden set first; keep declared `inputs` accurate (`tests/test_prompts.py`).
6. Taxonomy changes touch three places: `taxonomy.json`, `playbook.json` (title/effort/mobile also drive the UI), golden set. `pytest` enforces golden accuracy (area/primary >= 0.90).
7. Competitor claims come from official pages only; Westpac NZ is indicative; "-" means not mentioned. Recommendations are ideas to validate.
8. Always report segment, period and n; results are directional.

## Definition of done
`make test` green, `make demo` runs, UI console has no errors at 1360px and 390px (light + dark), docs updated if a contract changed.
