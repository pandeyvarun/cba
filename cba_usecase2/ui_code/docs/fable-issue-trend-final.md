**APPROVE.** All three closure conditions are met, and the `pointer-events` change is sound.

| Condition | Result | Evidence |
|---|---|---|
| fix1: date labels use the readable class | Closed | `public/app.js:73` — the first/last period labels carry `class="trend-axis-label"` with `start`/`end` anchors; `styles.css:45` sets that class to 12px. |
| Evidence file committed | Closed | `qa/issue-trend-browser-results.json` has 26 checks, 26 passed, 0 failed, no errors, source "Real embedded DuckDB data; no model calls". `qa/issue-trend-final-control.json` agrees (26/0, all five closed conditions true, snapshot unchanged). |
| Rollback sentence and target | Closed | `docs/duckdb-rollback-plan.json` targets release `2026-11-24T10-14-22-289Z-69099bc5` in `SNAPSHOT` mode, described as the previous verified DuckDB release with no SQL/UC dependency. `ARCHITECTURE.md:128` states rollback keeps the same embedded dataset and does not restore warehouse queries. |

**Font size:** by my own arithmetic from the CSS, the 12-unit labels render at roughly 10.5px at 1280, 12px at 1440 and 15px at 1920. The 1280 case is the tight one: it would sit almost exactly on 10px if a classic scrollbar takes sidebar width.

**`pointer-events:none` on `.chart-dot` (`styles.css:47`):** correct. Hover falls through to the `.trend-hit` circle in the same `.trend-point` group, so the tooltip lookup and the hover styling still work. The hit circles don't overlap horizontally at any point count, so a dot can no longer steal hover from a neighbouring month in dense charts.

Three things the read-only gate could not establish:
- **Dates in the font gate:** the three font checks are named "Chart numbers at least 10px", so that they cover the date labels rests on the control file's assertion and my arithmetic; I did not read the test script.
- **Evidence vs. final CSS:** the evidence is stamped 10:49:44Z, and I can't tell whether that run came before or after the `pointer-events` line was added.
- **Dataset/model/auth unchanged:** taken from your statement and the control file's `snapshotUnchanged: true`; I did not re-read the server modules.