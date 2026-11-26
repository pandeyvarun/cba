---
name: ui-builder
description: Use when the user wants the interactive Customer Intelligence web app generated or changed (overview, competitor heatmap, voice of customer, backlog, connectors, data sources).
---
# UI builder

## Purpose
Produce a single self-contained `dist/index.html` for Banking Portfolio Leads and App Product Owners, themed in CBA yellow.

## Inputs
`data/processed/comments_categorised.csv`, `config/*.json`, templates in `src/ci/ui/templates/` (`app.css`, `app_body.html`, `app.js`).

## Outputs
`dist/index.html` (data embedded as JSON; Chart.js and SheetJS from CDN).

## Procedure
1. `ci build-ui` (writes `dist/index.html`) and open it in a browser.
2. Tabs to verify: Overview (KPIs, dynamic insights, charts), Competitors (heatmap, area drawer, feature matrix), Voice of customer, Backlog, Connectors (Jira), Data sources (import).
3. Change look and feel in `templates/app.css` (tokens at the top, light + dark); behaviour in `app.js`; markup in `app_body.html`.
4. After any template change run `make demo` and click through each tab at desktop and phone width.

## Quality gates
- [ ] Browser console has no errors on any tab.
- [ ] No horizontal scroll at 390px width; dark mode readable.
- [ ] Insights shown in the UI match `data/reports/insights.json` for the same segment.
- [ ] No API tokens are stored in the page; Jira is export-based unless a backend proxy exists.

## Prompts used
`exec_briefing.md` (UI "Ask Claude" button when hosted where a model is available).

## Failure modes
- File > 16 MB if hosted as an artifact: reduce `cba` rows in `ui/export_data.py`.
- Regex differences between Python and JavaScript: patterns come from `taxonomy.json`; avoid Python-only syntax (`(?i)`, possessive quantifiers).

## Extending
New chart or tab: add markup to `app_body.html`, a render function in `app.js`, and (if it needs data) a field in `export_data.py`.
