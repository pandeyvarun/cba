# Prompt templates

Every LLM call in the pipeline uses a template from this folder - no prompt text lives in Python.

**Format** (`src/ci/llm/prompts.py`)

```
---
name: <file name without .md>
description: what it does
inputs: [variables used as {{variable}}]
output: json | text
stage: categorise | analyse | recommend | ui
---
## system
...
## user
... {{variable}} ...
```

Variables are replaced with `{{name}}`; lists/dicts are JSON-encoded automatically.

| Template | Stage | Used by | Output |
|---|---|---|---|
| `categorise_batch.md` | categorise | `ci.categorise.llm` | JSON array |
| `segment_account.md` | categorise | ad-hoc / hybrid fallback | JSON |
| `sentiment_target.md` | categorise | ad-hoc review of low-confidence rows | JSON array |
| `competitor_features.md` | analyse | `skills/analysis` (feature extraction from help pages) | JSON |
| `area_summary.md` | analyse | regenerate `config/playbook.json` positives/negatives | JSON |
| `insight_narrative.md` | analyse | optional narration of computed insights | text |
| `recommendations.md` | recommend | draft backlog from scorecard evidence | JSON array |
| `jira_story.md` | recommend | `ci.recommend.llm.refine` | JSON |
| `exec_briefing.md` | ui | UI "Ask Claude" briefing + digests | text |

**Rules for editing prompts**
1. Keep the output schema in the prompt identical to what the Python validator expects.
2. Never ask the model for numbers - statistics are computed in code and passed in.
3. Add a failing example to `evals/classification_golden.jsonl` before changing the categorisation prompt.
