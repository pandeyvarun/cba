# pipeline/ - collection to the analysed workbook, one script per step

    01_collect.py  ->  02_process.py  ->  03_categorise.py  ->  04_enrich.py  ->  05_build_workbook.py
    data/raw/*.csv    data/interim/      data/processed/       data/processed/    data/reports/
                      comments_clean     comments_categorised  comments_enriched  commbank-user-comments-analysed.xlsx

Run everything: `python pipeline/run_all.py` (or `make workbook`). Run one step: `python pipeline/0N_*.py --help`.
Files are the only interface between steps, so you can inspect or hand-edit any intermediate CSV and re-run from the next step
(`run_all.py --from-step 4`). Every step accepts `--set section.key=value` to override `config/settings.yaml`.

| Step | What it does | Useful flags |
|---|---|---|
| 1 | Pulls from sources in `config/sources.yaml` (Google Play, App Store RSS, Reddit via Arctic Shift archive, Hacker News, file imports) | `--preset workbooks\|public\|enabled`, `--source NAME...`, `--since`, `--incremental` |
| 2 | Strips HTML/URLs, redacts PII, hashes UserIDs | `--profile archive` (default, keep every comment) or `analysis` (length/duplicate rules) |
| 3 | Rules-based area, account type and sentiment (VADER for unrated text) | `--mode rules\|llm\|hybrid` |
| 4 | Adds "Areas for improvement" and "What competitors are offering" for our bank | |
| 5 | Writes the 7-tab workbook: Method & Notes, Comments, Summary, Competitor Reference, Intel x2, Mobile App Feature Matrix | `--out` |

Public-source collection needs no credentials. Reddit via PRAW needs `.env`; the archive collector does not. The default
`workbooks` preset replays the historical dataset in `data/input/`, so the build works offline.
