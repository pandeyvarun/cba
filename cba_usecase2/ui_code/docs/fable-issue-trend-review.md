**BLOCK** — the rename and aggregation are sound, but three small things need fixing before this meets "understandable". This is from code reading only: `qa/issue-trend-browser-results.json` does not exist yet, and I ran nothing.

## Blocking fixes

1. **The chart numbers render at about 6–8px on desktop.** The 300-unit viewBox is squeezed into a 175–202px sidebar column, so everything scales to about 0.58–0.67.
   - At 1440px wide (232px column) the value labels come out near 7.4px, the overlay text near 8px and the 0/max scale near 6.7px; the 205px column is smaller still.
   - The fixed `height:158px` (`styles.css:45`) also leaves about 26px of dead space above and below the chart.
   - Fix: make one unit roughly one pixel. Use a viewBox about 180 wide, set `height:auto`, cap the svg at about `max-width:320px` for the two-column tablet layout, and shrink the overlay rect to about 120 wide with its clamp adjusted.
   - Alternative: keep the geometry and scale font units about 1.5× (value 16, overlay 17, axis 14), and raise the `labelEvery` width factor from 7 to about 10.
   - Gate: computed text height of at least 10px at 1280, 1440 and 1920.

2. **The forced last-point label collides with the previous thinned label** (`app.js:73`). With 12 points and 3-digit counts, indices 10 and 11 are both labelled about 20 units apart with labels about 20 wide. With 23 points and counts like "1,234", indices 20 and 22 overlap outright. Fix the condition:
   ```js
   (i%labelEvery===0&&points.length-1-i>=labelEvery)||i===points.length-1
   ```

3. **One visible "YAML" remains in the About copy** (`app.js:100`): "Other profiles and the YAML lens have CommBank evidence only." Change it to "the Issue categories lens". "Original YAML version" describes the source file and can stay.

## Verified

- **Rename:** the lens label in `data.mjs:42`, the context chip and the About intro all read "Issue categories". The internal `yaml` key and filter state are untouched, and the mock inherits the label through `buildMetadata`.
- **Aggregation:** unchanged; the mock's per-record trend rows sum correctly on the client.
- **Overlay clamp:** the overlay stays inside the viewBox horizontally and at the top, and is drawn after the points.
- **Dense charts:** every point keeps its hit target, tab stop and accessible label, and the full-value table remains.
- **CSP:** no inline styles; positioning uses the `transform` attribute and classes only.
- **Edge cases:** a single point and the empty, loading and error states render correctly.

## Non-blocking

- **Overlay covers its own point:** for any point in the top fifth of the chart (always including the max), the overlay sits on the dot and its label. Place it below (`y+12`) when `y-58<0`.
- **Double tooltip:** the `<title>` inside each point shows a native tooltip on top of the custom one. Remove it; the `aria-label` already carries the text.
- **Hover/focus race:** focus point A, hover B, then leave B, and A stays focused with no overlay. On `pointerout`, re-show the overlay for a focused point.
- **Singular:** the `aria-label` says "1 records" while the overlay says "1 record".
- **Escape:** it does not dismiss the overlay. This is low risk because the overlay does not capture the pointer and the same values are in the table.