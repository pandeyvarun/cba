# CBA Customer Intelligence - project guide for Claude Code

End-to-end pipeline that turns public customer feedback (app stores, Reddit, ServiceNow, files) into
competitor intelligence, a prioritised mobile-app backlog and an interactive dashboard.

## Commands
- `make demo` - offline end-to-end run on `data/sample/` -> `dist/index.html` (no credentials)
- `make test` - unit + offline e2e tests (must pass before any commit)
- `make workbook` - five step scripts in `pipeline/` (collect, process, categorise, enrich, build xlsx)
- `make eval` - categoriser accuracy on `evals/classification_golden.jsonl`
- `python -m ci <collect|process|categorise|analyse|recommend|build-ui|run|demo>` (see `--help`)
- `make link-skills` - expose `skills/` to Claude Code

## Pipeline and module map
| Stage | Code | Reads | Writes | Skill |
|---|---|---|---|---|
| Collect | `src/ci/collect/` | `config/sources.yaml` | `data/raw/` | `skills/data-collection` |
| Process | `src/ci/process/` | raw | `data/interim/` | `skills/data-processing` |
| Categorise | `src/ci/categorise/` | interim, `config/taxonomy.json`, `segments.json` | `data/processed/` | `skills/category-extraction` |
| Analyse | `src/ci/analyse/` | processed | `data/reports/` | `skills/analysis` |
| Recommend | `src/ci/recommend/` | processed, `config/playbook.json` | `data/reports/` (backlog, Jira) | `skills/recommendations` |
| UI | `src/ci/ui/` (+ `templates/`) | processed, `config/*.json` | `dist/index.html` | `skills/ui-builder` |

Shared: `config.py` (settings/paths), `schema.py` (data contract), `llm/` (Claude client + prompt loader), `prompts/*.md`.
Orchestration: `skills/pipeline-orchestrator`.

## Rules
1. **Statistics are computed in code, never by an LLM.** LLMs label, summarise and draft; prompts receive computed numbers.
2. **Stages talk through files only.** Do not import one stage from another except via `schema.py`/`config.py` (analyse metrics are reused by recommend).
3. **Privacy:** never read or print `.env`; never commit `data/raw`, credentials or un-redacted text; PII redaction is deterministic and tested.
4. **No live side effects without approval:** collectors needing credentials stay `enabled: false` until the user agrees; `ci recommend --push` is blocked in `.claude/settings.json` - ask first and keep `jira.dry_run: true` otherwise.
5. **Prompts live in `prompts/`** with declared inputs (`tests/test_prompts.py` enforces it). Change the golden set before changing a categorisation prompt.
6. **Taxonomy changes touch four places:** `taxonomy.json`, `playbook.json`, golden set, UI `TITLES`/`EFFORT` in `templates/app.js`.
7. Competitor claims come from official pages only; Westpac NZ pages are indicative, "-" means "not mentioned", not "absent". Recommendations are ideas to validate, not confirmed gaps.
8. Results are directional (rule-based tagging, uneven sample sizes). Always state segment, period and n.

## Style
Python 3.10+, type hints, small pure functions, `ruff`-clean. Add a test for every new rule or collector (no network in tests).
