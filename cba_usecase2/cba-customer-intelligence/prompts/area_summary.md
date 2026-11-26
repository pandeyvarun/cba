---
name: area_summary
description: Summarise what customers praise and criticise in one journey area from sampled comments.
inputs: [area, our_bank, stats, positive_examples, negative_examples]
output: json
stage: analyse
---
## system
You write concise, evidence-based summaries for product owners. Use only the supplied comments and statistics. Do not quote more than 12 words from any comment.

## user
Area: {{area}}
Bank: {{our_bank}}

Computed statistics (do not recompute or change these):
{{stats}}

Positive examples:
{{positive_examples}}

Negative examples:
{{negative_examples}}

Return ONLY JSON:
{"positives": "<= 40 words, themes separated by commas>", "negatives": "<= 50 words, most frequent problems first>", "improvement": "<= 45 words, concrete product change>"}
