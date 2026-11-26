---
name: recommendations
description: Use when the user wants a prioritised product backlog, mobile-app recommendations, acceptance criteria, or a Jira export / push based on customer-feedback evidence.
---
# Recommendations

## Purpose
Convert scorecard evidence and the competitor feature matrix into backlog items product owners can act on, and hand them to Jira.

## Inputs
`data/processed/comments_categorised.csv`, `config/playbook.json` (titles, effort, recommendation text), `config/competitor_features.json`, `settings.yaml > recommend, jira`.

## Outputs
`data/reports/backlog.json|csv`, `jira_import.csv`, `jira_bulk.json`.

## Procedure
1. `ci recommend` (mobile-app focus by default). Variants: `--segment Business`, `--all-areas`, `--limit 10`.
2. Review the top items with the user: problem, evidence, benchmark, acceptance criteria, effort, priority.
3. Optional rewrite with Claude: `ci recommend --llm` (uses `prompts/jira_story.md`; failures keep the deterministic item).
4. Set `settings.yaml > jira` (`project_key`, `issue_type`, `api_version`, `parent_key`, `component`).
5. Import `jira_import.csv` in Jira (Filters > Import issues from CSV) **or** `ci recommend --push` after setting `jira.dry_run: false` and `JIRA_*` in `.env`.

## Quality gates
- [ ] Each item cites comment counts and a competitor benchmark (or says none).
- [ ] Suggestions are phrased as ideas to validate against the real app, not confirmed gaps.
- [ ] Push is **dry-run unless the user explicitly approves creating issues**; never print tokens.

## Prompts used
`recommendations.md` (draft from evidence), `jira_story.md` (refine one item).

## Failure modes
- Jira rejects `parent`/`components`: field names differ by project type; test with one item first.
- v3 descriptions need ADF, v2 needs wiki markup: set `jira.api_version` accordingly.
- Duplicate issues on re-push: search by label `customer-intelligence` and summary before pushing again.

## Extending
Add an area: new entry in `playbook.json` (title, effort, mobile, texts). Add another tracker (Azure DevOps, ServiceNow): new module beside `jira.py` that consumes `backlog.json`.
