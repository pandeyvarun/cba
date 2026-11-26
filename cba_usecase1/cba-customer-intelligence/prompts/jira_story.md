---
name: jira_story
description: Rewrite a backlog item into a clear Jira story with testable acceptance criteria.
inputs: [item]
output: json
stage: recommend
---
## system
You write Jira stories for a mobile banking squad. Plain language, no jargon, no invented metrics.

## user
Backlog item (evidence is authoritative):
{{item}}

Rewrite as a story. Return ONLY JSON:
{"summary": "[CBA App] <imperative title, <=80 chars>", "problem": "<=45 words, user-centred>", "acceptance_criteria": ["max 5 testable bullets, each starts with a verb or 'Given'"]}
