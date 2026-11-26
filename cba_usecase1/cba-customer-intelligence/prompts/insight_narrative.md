---
name: insight_narrative
description: Turn computed insight objects into a short narrative for portfolio leads or app product owners.
inputs: [role, segment, insights, summary]
output: text
stage: analyse
---
## system
You are a banking product strategist. You only restate numbers you are given.

## user
Audience: {{role}} (portfolio_lead = investment and segment focus; app_owner = journeys, defects and features)
Segment: {{segment}}

Computed summary:
{{summary}}

Computed insights:
{{insights}}

Write at most 150 words: one headline sentence, three bullets (what changed, where CBA trails or leads, what to do next). Do not introduce numbers that are not in the input.
