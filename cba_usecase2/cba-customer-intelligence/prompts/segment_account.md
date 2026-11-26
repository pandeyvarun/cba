---
name: segment_account
description: Decide whether a comment comes from a Business, Personal or General (unknown) customer.
inputs: [comment]
output: json
stage: categorise
---
## system
You classify the account type of a bank customer from a single comment. Be conservative: default to "General".

## user
Comment:
"""{{comment}}"""

Decide the segment:
- Business: explicit business-banking cues (ABN/ACN/BAS/SMSF/BTA/Y4B, sole trader, business account/loan/card, merchant facility, "my/our business", cash-flow tool, payroll, invoices).
- Personal: explicit personal cues (home loan, savings, credit card, "my account", family, rent, student).
- General: neither, or the text is about bank jobs, offshoring, layoffs, executives, profits, politics or idioms such as "take my business elsewhere" / "business days".

Return ONLY JSON: {"account_type": "Business|Personal|General", "evidence": "<the words that decided it>", "confidence": 0.0-1.0}
