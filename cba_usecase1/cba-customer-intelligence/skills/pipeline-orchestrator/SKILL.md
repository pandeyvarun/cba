---
name: pipeline-orchestrator
description: Use when the user wants to refresh the customer-intelligence dashboard end to end, or run several stages in order (collect -> process -> categorise -> analyse -> recommend -> build UI).
---
# Pipeline orchestrator

## Purpose
Run the whole feedback-to-backlog pipeline in the right order, stop on a failed quality gate, and report what changed.

## Inputs
- `config/settings.yaml`, `config/sources.yaml`
- Optional: `.env` (collectors, Anthropic, Jira)

## Outputs
`data/raw/comments_<date>.csv` -> `data/interim/comments_clean.csv` -> `data/processed/comments_categorised.csv`
-> `data/reports/*` (scorecards, insights.json, backlog.json, jira_*) -> `dist/index.html`

## Procedure
1. Confirm which sources are `enabled` in `config/sources.yaml`; ask before enabling anything that needs credentials.
2. `ci collect [--source NAME] [--since YYYY-MM-DD]`   (skip if the user supplied a file: `ci process --input FILE`)
3. `ci process`  -> check gate A
4. `ci categorise --mode rules|hybrid|llm` -> check gate B
5. `ci analyse` -> check gate C
6. `ci recommend [--segment Business] [--all-areas]`
7. `ci build-ui` and open `dist/index.html`
8. Summarise: rows in/out, top 3 insights (`data/reports/insights.json`), top 5 backlog items, anything skipped.

Offline smoke test: `make demo`. One shot: `ci run --mode hybrid`.

## Quality gates
- A: >= 90% of raw rows survive processing; `pii_redacted` rows are counted, not hidden.
- B: < 40% of rows in "Other (not classifiable)" for app-store sources; golden eval accuracy >= 0.8 (`make eval`).
- C: every benchmarked area has n >= `analysis.min_n_area`.

## Prompts used
None directly; delegates to the stage skills.

## Failure modes
- A collector fails -> others still run (see console); re-run just that source with `--source`.
- Missing `ANTHROPIC_API_KEY` in llm/hybrid mode -> fall back to `--mode rules` and say so.
- Empty reports -> input too small for `min_n_area`; lower it with `--set analysis.min_n_area=5` for demos only.

## Extending
New stage = new module in `src/ci/<stage>/`, a CLI sub-command, a skill folder, and a gate here.
