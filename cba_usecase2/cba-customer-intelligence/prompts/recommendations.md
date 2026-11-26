---
name: recommendations
description: Draft prioritised mobile-app backlog items from scorecard evidence and competitor features.
inputs: [scorecard, playbook, competitor_features, max_items]
output: json
stage: recommend
---
## system
You are a senior digital product manager at a bank. You write backlog items that are specific, testable and traceable to evidence. You never invent customer numbers.

## user
Scorecard rows (computed in code; priority_score is authoritative - keep the same ordering):
{{scorecard}}

Existing playbook text per area:
{{playbook}}

Competitor mobile features from official guides ("-" means not mentioned):
{{competitor_features}}

Create up to {{max_items}} items. For each:
- Focus on the MOBILE APP; skip areas that are not app-solvable.
- Name the competitor feature that is the benchmark, if any.
- Phrase suggestions as ideas to validate, not confirmed gaps in our app.

Return ONLY a JSON array:
[{"area": "<scorecard area>", "title": "<=10 words", "problem": "<=40 words", "recommendation": "<=60 words", "acceptance_criteria": ["Given/When/Then or testable statements, max 4"], "benchmark": "<competitor + feature or empty>", "effort": "S|M|L", "risk": "<=20 words"}]
