# Consolidated requirements and business rules

## Users
Banking Portfolio Leads (segments, investment priorities, competitor position) and App Product Owners (journeys, defects, features, backlog).

## Deliverables requested (all exist)
1. Annotated CBA workbook (`artifacts/workbook/commbank-user-comments-analysed.xlsx`).
2. Competitor intelligence tabs (Business only; Business + General) with CBA positives/negatives and mobile-app features/suggestions.
3. Interactive HTML app (CBA yellow theme) with insights, connectors (Jira) and data sources.
4. Modular repo with prompts and skills specs (this repo).

## Labels
- **Primary area:** Onboarding, Statements, Transaction, Non Functional (+ "Other (not classifiable)" for chatter).
- **Secondary areas (29):** see `config/taxonomy.json` (ordered; specific before generic). Playbook text per area: `config/playbook.json`.
- **Account type:** Business | Personal | General. Business > Personal > General. Rules in `config/segments.json`:
  Business keywords from the user: Business, Cash flow, Profile, Two factor authentication, 2 way sign in, BTA, Business loan, Corporate, Y4B, BAS, Appointment booking, ABN, ACN, SMSF.
  Job/corporate chatter, news, idioms and "business days" are never Business.
- **Sentiment:** Positive/Negative/Neutral/Mixed. Rated rows: 4-5 Positive, 1-2 Negative, 3 Neutral (Mixed if text strongly contradicts). Unrated: VADER thresholds (+0.4 / -0.35), Mixed for long posts with strongly opposing sentences.
- Unrated rows with no banking vocabulary -> Other. Rated rows with no topical keyword -> "Overall app experience".

## Analysis definitions
- neg% / pos% per bank per area per segment; competitor pool = ANZ + NAB + Westpac.
- `gap_pts = CBA neg% - pooled rivals neg%` when both n >= 10 (gap/strength insights need n >= 30).
- `priority_score = CBA_negatives * (1 + max(0, gap) * 2)`, scaled 0-100. Bands: Highest >= 70, High >= 50, Medium >= 30, else Low.
- Momentum: neg% last 3 months vs previous 3 months (needs 15 comments in each window).
- Insights (6 shown, order depends on role): biggest pain point, largest competitor gap, competitor advantage, strength to protect, rising complaints, business view, top app opportunity.

## UI behaviour
Tabs: Overview, Competitors, Voice of customer, Backlog, Connectors, Data sources. Segment chips (All, Business, Personal, General, Business+General) re-compute every number and insight.
Area drawer: stats, bank comparison, CBA positives/negatives, example comments per bank, what competitors offer, competitor mobile features, recommended actions, add to Jira queue.
Imported data (file/paste) is classified in the browser with the same rules and merged into all views; stored in localStorage.
Jira: save site/project/issue type/API version/parent/component/labels; export CSV or bulk JSON (ADF for v3, wiki for v2) or copy cURL. No tokens in the page.
Theme: CBA yellow `#FFCC00`, black, Inter; light/dark tokens; responsive to 390px.

## Competitor evidence rules
Official pages/PDFs only: ANZ App FAQ + Easy Read PDF, NAB app page, NAB Connect mobile page + Quick Reference Guide (2018), Westpac NZ help index pages (indicative, NZ not AU).
"-" = not mentioned. Suggestions are ideas to validate.

## Privacy and safety
Redact PII before analysis; hash authors; never commit `.env` or raw data; Jira push dry-run by default; app never stores secrets.
