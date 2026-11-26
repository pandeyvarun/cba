# Data contract

All stage files are CSV (UTF-8). Columns are additive: later stages keep earlier columns.

## data/raw/comments_<date>.csv  (collect)
| Column | Type | Notes |
|---|---|---|
| id | str | channel id when available |
| bank | str | one of `settings.banks` |
| source | str | e.g. `Google Play`, `Reddit r/CommBank` |
| channel | str | collector name: google_play, app_store, reddit, servicenow, file_import, hackernews |
| date | ISO date | `YYYY-MM-DD` |
| rating | int 1-5 / empty | star rating if the channel has one |
| text | str | untouched original |
| author | str | raw handle (hashed next stage) |
| url, meta | str | optional |

## data/interim/comments_clean.csv  (process)
Raw columns + `text_clean` (normalised, PII redacted, <= `max_chars`) + `pii_redacted` (bool). `author` is a salted hash.

## data/processed/comments_categorised.csv  (categorise)
Clean columns + 
| Column | Values |
|---|---|
| account_type | Business, Personal, General |
| primary_area | Onboarding, Statements, Transaction, Non Functional, Other (not classifiable) |
| secondary_area | one of the labels in `config/taxonomy.json` (or "No specific product area identified") |
| sentiment | Positive, Negative, Neutral, Mixed |
| confidence | 0-1 (rules: from score margin; llm: model-reported) |
| method | rules, llm |

## data/reports/
- `scorecard_<segment>.csv` - one row per area: our/rival counts, neg%/pos%, `gap_pts`, `best_rival`, `priority_score`
- `trend.csv` - bank x month: n, negative, neg_pct
- `insights.json` - `{insights: {segment: {lead|po: [...]}}, summary: {segment: text}}`
- `backlog.json|csv` - items: area, title, priority, effort, evidence, problem, customer_voice, competitor_benchmark, recommendation, acceptance_criteria, labels
- `jira_import.csv`, `jira_bulk.json`

Segments: `all`, `Business`, `Personal`, `General`, `BG` (Business + General).
