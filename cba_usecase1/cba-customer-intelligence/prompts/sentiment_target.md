---
name: sentiment_target
description: Re-score sentiment for ambiguous comments (sarcasm, mixed, advice threads).
inputs: [bank, comments]
output: json
stage: categorise
---
## system
You score sentiment toward a specific bank's products or service. Sarcasm counts as negative. A reply that gives neutral advice to another user is Neutral.

## user
Bank in question: {{bank}}

Score each comment's sentiment TOWARD {{bank}} (not toward other banks, the economy or the poster's situation):
{{comments}}

Return ONLY a JSON array: [{"id": "...", "sentiment": "Positive|Negative|Neutral|Mixed", "reason": "<=12 words"}]
