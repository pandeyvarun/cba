# Chat history (structured record for Cursor)

> This is a faithful, structured reconstruction of the Claude conversation that produced this project: **your requests are verbatim**,
> outcomes and decisions are summarised. Read it top to bottom to understand *why* things are the way they are.
> Date of work: 24 Nov 2026. Data as of 21 Nov 2026.

## Starting point
Four workbooks supplied by the user (Reddit, Hacker News, Google Play, Apple App Store, ProductReview style feedback), one per bank:
`commbank-user-comments.xlsx` (10,413 rows), `anz-…` (4,032), `nab-…` (3,233), `westpac-…` (3,289).
Columns: `Source, UserID, Date, Comment, Reply, Rating` (+ a `Summary` sheet). Copies are in `data/input/`.

---
## Turn 1 - add analysis columns to the CBA workbook
**User:** "Use Commbank user comments file and create new columns in addition to existing one. Column Names would be, Account Type (Business/Personal), Primary Area (Onboarding, Statements,Transaction, Non Funtional) and Secondary area with details on primary area, Sentiment, Areas for improvement and What competitors are offering in this area. For competitor offering use ANZ, NAB and Westpac comments data"

**Outcome:** Rule-based tagger (keyword/regex with weights + VADER) written in Python (`prototype-scripts/classify.py`, later `config/taxonomy.json`).
Added columns G-L to the `Comments` sheet; added `Method & Notes` and `Competitor Reference` sheets.
Decisions: an extra bucket "Other (not classifiable)" for forum chatter (user listed only 4 primary areas); star ratings drive sentiment when present, VADER otherwise;
competitor text was written by reading samples of ANZ/NAB/Westpac comments per sub-area and appending per-bank evidence counts.

## Turn 2 - add "General" segment and Business keywords
**User:** "Instead of just Business and Personal account type add General as well. Comments with words key words Business, Cash flow, Profile, Two factor authentication, 2 way sign in, BTA, Business loan, Corporate, Y4B, BAS, Appointment booking, ABN, ACN, SMSF as Business Profile. Comments that can't be categorised as business or personal else general"

**Outcome:** Account type = Business / Personal / General. Business wins if any listed keyword matches (variants 2FA, 2-factor, cashflow included).
Personal = personal-banking cues; General = everything else. I used the value "Business" (not "Business Profile") to keep the three-value set.
Noted: broad keywords (Business, Profile, Two factor, Corporate) over-tag.

## Turn 3 - two competitor-intel tabs
**User:** "Create another tab with competitor intelligence only with Business and one tab with Business and general categories"

**Outcome:** Tabs `Intel - Business Only` and `Intel - Business + General` (per-area CBA vs ANZ/NAB/Westpac counts, %pos/%neg, strongest competitor,
intelligence text, opportunity). Business-only tab also lists the supporting competitor comments (column V onward after later changes).
Found that "business days/hours" was polluting Business; excluded it.

## Turn 4 - clean the Business category
**User:** "Yes please make it cleaner remove anything related job chatter etc. from business category and put in general category"

**Outcome:** Business now requires a specific business-banking cue (ABN/ACN/BAS/SMSF/BTA/Y4B, sole trader, CommBiz, NAB Connect, business account/loan/card,
merchant facility, self-employed, cash-flow tool, appointment booking) or, when it is *not* job/corporate chatter, a general cue (my/our business, small business,
Profile, Two factor/2FA, Cash flow, Corporate). Job chatter (offshoring, layoffs, recruitment, salaries, executives, profits, news), idioms ("take my business elsewhere")
and "business days" are never Business. Result: CBA Business 363 -> 182; competitor Business 320 -> 142. Business-only intel text rewritten against the cleaned set.

## Turn 5 - CBA positives/negatives columns
**User:** "In intel and competitor reference tabs include summary of  CBA positive and negatives also as two columns"

**Outcome:** Columns `CBA positives (summary)` and `CBA negatives (summary)` (hand-written themes per area from reading CBA comments, plus live counts per view;
Business-only tab adds one example comment). Code: `prototype-scripts/cba_sum.py` -> now `config/playbook.json` (`positives`, `negatives`).

## Turn 6 - competitor mobile app features
**User (with ANZ + NAB PDFs):** "In competitor intelligence use Competitors mobile app futures as well to provide suggestions to CBA. Use the guides from https://www.nab.com.au/business/online-banking/nab-connect/help-videos/mobile-app , https://www.nab.com.au/personal/online-banking/mobile-banking-app, https://www.westpac.co.nz/help/ways-to-bank-faqs/westpac-one-faqs/#cards, https://www.westpac.co.nz/help/app-and-online-banking-how-to-guides/, https://www.anz.com.au/ways-to-bank/mobile-banking-apps/anz-app/faq/ and attached documents. Keep the recommendations mainly to mobile app."

**Outcome:** Pages fetched and PDFs read. Added `Competitor mobile app features` and `Mobile app suggestions for CBA` columns and a `Mobile App Feature Matrix` sheet (35 features).
Important caveats recorded: the two Westpac pages are **Westpac New Zealand** and list how-to titles only (indicative); the NAB Connect guide PDF is dated Sept 2018;
the NAB Connect video page had no transcript. Facts worth remembering: ANZ ends push notifications for incoming/outgoing **business** payments on 16 Sep 2026;
ANZ does not alert when a scheduled payment fails; NAB offers 2 years of in-app statements, Cash Prediction, Saving Spaces, tap-to-identify purchases and $0 foreign-currency transfer fee.
"-" in the matrix means not mentioned, not absent. Suggestions are ideas to validate, not confirmed gaps in CBA's app.

## Turn 7 - HTML app
**User:** "Create a HTML App. Use CBA Yellow and website theme to do the Customer intelligence on the existing data. Users are Banking Portfolio leads, App Product Owners in the bank. Should have view on competitor intelligence across categories areas, etc. Create dynamic insights based on data for area. Create connectors tab where user can link their Jira for product backlog based on recommendations. Add Data Sources tab give facility for users to add data from Apps store, Google play, reddit, Service Now and any other channel where customer feedback come. Make UI best so that looks like real website. Use images, ICONs etc."

**Outcome:** Single-file app (published as a Claude artifact: https://claude.ai/artifact/QaqHDYeBKzd8hziBhJ1eG7; source in `artifacts/app/customer-intelligence-hub.html` and, templated, in `src/ci/ui/templates/`).
Tabs: Overview (KPIs, dynamic insights, exec briefing, charts), Competitors (heatmap with segment/category/metric filters, area drawer, mobile feature matrix),
Voice of customer (search/filter/export), Backlog (priority-scored recommendations), Connectors (Jira settings, queue, CSV/JSON/cURL export; Slack/Confluence/Excel/ServiceNow/email/warehouse exports),
Data sources (App Store, Google Play, Reddit, ServiceNow, review sites, social, contact centre, any file: connection details, collector snippet, CSV/XLSX/JSON/paste import, in-browser classification).
Design: CBA yellow `#FFCC00` + black, Inter font, light/dark tokens, role switch (Portfolio Lead vs App Owner), inline SVG icons/illustration (no remote images - CSP).
Decisions: Jira is **export-based** (browser cannot call Jira, and API tokens are never stored); live pulls from channels require a backend, so import is file-based; logo is a generic mark, not the CommBank logo.
Verified in a headless browser at desktop and 390px width, light and dark; fixed nav overflow and horizontal scroll on mobile.

## Turn 8 - modular repo for Claude Code
**User:** "Use cluade code and create modular code snippets for end to end. Data Collection, Data Processing, Catgory extraction, Analysis, Recommendations and UI. Create this as end to end project repo. Include Prompt templates as well. Create a folder for skills specification as well"

**Outcome:** This repository (`cba-customer-intelligence`): `src/ci/{collect,process,categorise,analyse,recommend,ui,llm}`, `prompts/` (9 templates), `skills/` (7 SKILL.md specs + template),
`config/` (taxonomy, segments, playbook, competitor features, settings, sources), CLI `ci`, tests (20 passing), golden eval set, `.claude/` commands and settings, `CLAUDE.md`.
A fake-LLM test caught a real bug (itertuples drops underscore-prefixed columns) - fixed. Golden accuracy (rules): area 0.85, sentiment 0.90, segment 0.80 on 20 examples.

## Turn 9 - this handoff
**User:** "Imprort entire chat for cursor along with artifacts so cusrsor can work"

**Outcome:** This bundle: repo + `.cursor/rules` + `AGENTS.md` + these context docs + all artifacts (workbook, HTML app, tagged data, prototype scripts, reference PDFs, screenshots).
`.claude/` and `CLAUDE.md` are kept so the repo works in both Cursor and Claude Code.
Added `Workbook <bank>` sources (disabled) so the full 20,967-row dataset can be re-run through the pipeline: `ci run --source "Workbook CBA" "Workbook ANZ" "Workbook NAB" "Workbook Westpac"`.

---
## Reproducibility note: workbook vs pipeline numbers
The Excel workbook was built by the prototype scripts on all 20,967 rows. The pipeline adds a cleaning step (drops rows under 12 characters and exact duplicates, redacts PII),
so with the dashboard rules (`make full`) it keeps 20,628 rows (CBA 10,242 of 10,413); the `pipeline/` archive profile keeps CBA 10,404. Segment/sentiment/area labels use the same rules; counts differ slightly (e.g. CBA Business 181 vs 182).
