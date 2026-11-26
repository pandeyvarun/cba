---
description: Run the customer-intelligence pipeline end to end and summarise the results
argument-hint: "[rules|hybrid|llm] [--since YYYY-MM-DD]"
---
Follow the `pipeline-orchestrator` skill in `skills/pipeline-orchestrator/SKILL.md`.

Mode and options from the user: $ARGUMENTS (default mode: rules).

1. List enabled sources from `config/sources.yaml` and confirm any that need credentials.
2. Run the stages in order and check each quality gate. Stop and explain if a gate fails.
3. Finish with: rows in/out, top 3 insights from `data/reports/insights.json`, top 5 backlog items, and the path to `dist/index.html`.
Never run `--push` unless I explicitly say so.
