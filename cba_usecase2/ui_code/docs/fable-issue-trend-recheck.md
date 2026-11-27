## Verdict: BLOCK — one remaining font miss, plus missing gate evidence

Read-only review; nothing was run. `qa/issue-trend-browser-results.json` does not exist under `frontend/qa/` or the root `qa/`, so the ≥10px browser gate is unverified and the sizes below are computed from the CSS.

### Blockers

1. **X-axis period labels are still 10 units, which is 8.75px at 1280.** The two `<text … y="144">` date labels at `frontend/public/app.js:73` carry no class, so they fall back to `.trend-chart text{font-size:10px}` at `frontend/public/styles.css:30`. Fix: add `class="trend-axis-label"` to that text; the two labels still cannot collide at 12 units.

   | Viewport | Chart width | Scale | 12-unit labels | X-axis dates (10 units) |
   |---|---|---|---|---|
   | 1280 | 175px | 0.875 | 10.5px | **8.75px** |
   | 1440 | 202px | 1.01 | 12.1px | 10.1px |
   | 1920 | 254px | 1.27 | 15.2px | 12.7px |

2. **The browser evidence is not on disk, but the doc cites it.** `frontend/ARCHITECTURE.md:147` says the UI follow-up "has its own Fable review and browser evidence". Either commit the results file after re-running with fix 1 (the gate must measure the date labels too), or drop that sentence.

3. **The rollback description omits what the rollback target is.** `docs/duckdb-rollback-plan.json` redeploys the pre-DuckDB "classified v3" release, which by its own text "needs its prior OBO data permissions". `ARCHITECTURE.md:128` reads as if rollback keeps the warehouse-free design. Add one sentence saying the rollback target is the warehouse-backed release and depends on the viewers' SQL and Unity Catalog grants. Once this UI release ships, the plan also no longer points at the immediately preceding release.

### Confirmed fixed
- **Sizing:** viewBox is 200×152, and the final CSS rule wins on specificity (`height:auto`, `max-width:320px`). Count and y-axis labels are 12 units and the overlay is 13.
- **Label thinning:** kept labels are always spaced wider than the widest label, and the label before the forced last one is suppressed when too close.
- **Hit radii:** twice the radius is 148/(N−1) against a spacing of 156/(N−1), so they never overlap.
- **Tooltip:** it flips below the point near the top, stays inside the viewBox on all sides, and ignores pointer events. There is no native `<title>`.
- **Focus and Escape:** leaving a hovered point restores the focused point's tip, and Escape clears all tips.
- **Rename:** the Issue categories lens label, context chip and About text are renamed, and the internal `yaml` keys are untouched.
- **Architecture doc against source:** these match the code and manifest:
  - Data: 68,919 rows across 10 tables, the 10,555-row projection, 36,450,304 bytes in 12 parts.
  - DuckDB: two threads, 512 MB, external access and extensions off; 4 concurrent queries with a queue of 48.
  - Limits: cache of 150 entries at 60 seconds; 240-character redaction cap; page size 50; 12 excerpts; 5 model requests per minute with one in flight.
  - Boundaries: forwarded user for data and forwarded token for model routes; origin, content-type and body checks on model POSTs; snapshot validated before listen; mock mode refused when deployed.
  - Packaging: the staging allowlist, endpoint name, ID formats and the pinned `@duckdb/node-api`.

### Non-blocking
- **Scrollbar margin at 1280:** 10.5px is thin. If the sidebar shows a classic scrollbar of about 8px, 12-unit text lands at roughly 10.0px, so run the gate with scrollbars visible.
- **Possible label collision:** the first point's value label can overlap the y-axis max label when the first month has a count of three or more digits at roughly 72–95% of the max. The white halo would then erase part of the axis label. Check the default views; anchoring the first label with `text-anchor="start"` fixes it.
- **One more visible "YAML" in About:** the "Data products" line prints "CommBank YAML labels" from `ALIASES` in `server/classified.mjs:7`. It is a source name, like the retained version line, so keep or rename deliberately.
- **Not checked:** the 1,717 disagreement count, the profile cohort counts and the "82 / 15 / 9" QA tallies. I also could not read a `.git` directory, so I cannot confirm the local branch or that `frontend/ARCHITECTURE.md` is tracked in it. The doc's "repository root" wording is only right if the repo root is `frontend/`.

With fix 1, the evidence file committed (or the sentence removed), and the rollback sentence added, this is an APPROVE.