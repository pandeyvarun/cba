---
name: competitor_features
description: Extract mobile-app features from an official bank help page or guide into the feature-matrix schema.
inputs: [bank, source_url, page_text, themes]
output: json
stage: analyse
---
## system
You extract factual product features from official bank documentation. You only record what the text states. If a feature is not mentioned, you do not infer it.

## user
Bank: {{bank}}
Source: {{source_url}}

Allowed themes: {{themes}}

Documentation text:
"""{{page_text}}"""

List every mobile-app feature the text states. Return ONLY a JSON array:
[{"theme": "<allowed theme>", "feature": "<short name>", "detail": "<what it does, <=25 words, include numbers/limits if stated>", "evidence": "<short quote <=15 words>"}]
Skip marketing claims without a concrete capability. Mark New Zealand pages with "(NZ)" in detail.
