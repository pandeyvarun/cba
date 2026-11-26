---
name: category-extraction
description: Use when comments need labelling by journey area (category/sub-area), account segment (Business/Personal/General) and sentiment, or when the taxonomy or labelling prompt must change.
---
# Category extraction

## Purpose
Label every comment with `primary_area`, `secondary_area`, `account_type`, `sentiment` (+ `confidence`, `method`).

## Inputs
`data/interim/comments_clean.csv`, `config/taxonomy.json` (areas + regex weights), `config/segments.json`, `settings.yaml > categorise`.

## Outputs
`data/processed/comments_categorised.csv` (schema in `docs/data-contract.md`).

## Modes
| Mode | When | Cost |
|---|---|---|
| `rules` | default, offline, reproducible | free |
| `hybrid` | rules first; ambiguous rows (no match or margin < `low_confidence_margin`) go to Claude | low |
| `llm` | audit runs or a new taxonomy | highest |

## Procedure
1. `ci categorise --mode rules` and open the result.
2. Run the golden set: `make eval` (accuracy by field). Investigate misses before widening rules.
3. If "Other (not classifiable)" exceeds the gate, run `--mode hybrid` (needs `ANTHROPIC_API_KEY`).
4. Primary areas: **Onboarding, Statements, Transaction, Non Functional**; secondary areas are the 29 labels in `taxonomy.json`.
5. Segment rules: Business > Personal > General; job/corporate chatter, news and idioms ("take my business elsewhere", "business days") are never Business.

## Quality gates
- [ ] Golden accuracy >= 0.8 on area, >= 0.85 on sentiment.
- [ ] Spot-check 20 random rows per primary area (open `comments_categorised.csv`).
- [ ] LLM output validated against the taxonomy (invalid labels are discarded, rules result kept).

## Prompts used
`prompts/categorise_batch.md` (main), `prompts/segment_account.md`, `prompts/sentiment_target.md`.

## Failure modes
- Multi-topic comments take only the strongest area: acceptable; note the limit in reports.
- Sarcasm and advice threads skew sentiment on Reddit: re-score with `sentiment_target.md` for those rows.
- Taxonomy drift: any new label must be added to `taxonomy.json`, `playbook.json`, the UI `TITLES`/`EFFORT`, and the golden set together.

## Extending - add or change a category
1. Add the area to `config/taxonomy.json` (ordered; specific before generic) with `[regex, weight]` patterns.
2. Add its playbook entry in `config/playbook.json` (title, effort, mobile flag, texts).
3. Add 2+ golden examples to `evals/classification_golden.jsonl`; run `make eval`.
