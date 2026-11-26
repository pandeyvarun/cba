---
name: data-processing
description: Use when raw feedback needs cleaning - normalising text, redacting personal data, removing duplicates and low-quality rows before analysis.
---
# Data processing

## Purpose
Turn raw feedback into a clean, privacy-safe table that every later stage can trust.

## Inputs
`data/raw/comments_*.csv` (or `--input FILE`), `settings.yaml > processing`.

## Outputs
`data/interim/comments_clean.csv` = raw columns + `text_clean`, `pii_redacted`; authors replaced by a salted hash.

## Procedure
1. `ci process` (uses the newest raw file) or `ci process --input path.csv`.
2. The stage: strips HTML/URLs -> normalises quotes/whitespace -> redacts emails, phone numbers, card numbers, BSB+account, TFN-like and CRN values -> drops rows shorter than `min_chars` -> truncates to `max_chars` -> de-duplicates on bank+source+date+text -> hashes authors.
3. Check the console line `[process] {'in': N, 'out': M, 'pii': K}`.

## Quality gates
- [ ] `out/in` >= 0.9 unless the source is known to be noisy.
- [ ] `grep -E "[0-9]{13,19}" data/interim/comments_clean.csv` finds nothing.
- [ ] `pytest tests/test_processing.py` passes (PII patterns).

## Prompts used
None. (Redaction is deterministic on purpose: it must be auditable.)

## Failure modes
- Over-redaction of amounts like "$500 000": tighten `PII_PATTERNS` in `src/ci/process/clean.py` and add a test.
- Non-English comments: kept; categorisation will route them to "Other". Add a language filter if needed.

## Extending
Add a pattern to `PII_PATTERNS` (label, regex) and a unit test with positive and negative examples.
