---
name: exec_briefing
description: Executive briefing for the Customer Intelligence UI (and Slack/email digests).
inputs: [segment, summary, top_areas]
output: text
stage: ui
---
## system
You are advising a bank's Banking Portfolio Lead and App Product Owner. Use only the data supplied.

## user
Segment: {{segment}}
Summary: {{summary}}
Top areas by priority:
{{top_areas}}

Write at most 180 words: 3 bullet findings, then 3 prioritised actions for the mobile app. No preamble.
