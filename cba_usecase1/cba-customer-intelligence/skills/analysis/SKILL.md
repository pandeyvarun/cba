---
name: analysis
description: Use when the user asks how CBA compares with competitors, what is rising or falling, where the biggest gaps are, or wants scorecards, trends or dynamic insights by segment.
---
# Analysis

## Purpose
Turn categorised comments into decisions: per-area scorecards, competitor gaps, momentum and plain-language insights - for every segment (all, Business, Personal, General, Business+General).

## Inputs
`data/processed/comments_categorised.csv`, `settings.yaml > analysis`, `config/playbook.json`.

## Outputs (`data/reports/`)
`scorecard_<segment>.csv`, `trend.csv`, `insights.json` (insights per segment x role + executive summary).

## Definitions (computed in code - never by an LLM)
- `neg%` / `pos%` = share of comments in an area for a bank.
- `gap_pts` = our neg% - pooled rivals' neg% (only when both n >= `min_n_area`).
- `priority_score` = `our_neg * (1 + max(0, gap) * gap_weight)`, scaled 0-100.
- Momentum = neg% last 3 months vs previous 3 (needs `momentum_min_n` per window).

## Procedure
1. `ci analyse`.
2. Read `insights.json -> summary.all` and `insights.<segment>.<role>`: pain point, largest gap, competitor advantage, strength, rising complaints, business view, top app opportunity.
3. Optional narration: render `prompts/insight_narrative.md` with the computed objects (numbers must be copied verbatim).
4. When asked for competitor features, extract from official pages with `prompts/competitor_features.md`, save to `config/competitor_features.json` (mark Westpac NZ pages as indicative).

## Quality gates
- [ ] Every number in a narrative appears in the scorecard or insights JSON.
- [ ] Areas with n below the minimum are shown as "n<10", never ranked.
- [ ] Results state the segment and date range.

## Prompts used
`insight_narrative.md`, `area_summary.md`, `competitor_features.md`.

## Failure modes
- Source mix changes (e.g. a Reddit spike) distort trends: report by source in the UI before concluding.
- Competitor samples are not like-for-like (different review volumes): describe results as directional.

## Extending
Add a metric in `src/ci/analyse/metrics.py`, expose it in the scorecard, and (if shown in the UI) add it to `ui/export_data.py` and the template.
