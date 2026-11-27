# CommBank Business Customer Insights

[Solution architecture](ARCHITECTURE.md) — components, data flow, identity, DuckDB packaging, model calls and deployment.

A classified-review demo hosted in Databricks Apps, with all application data read from an embedded, server-private DuckDB snapshot. CommBank is the fixed focal bank; ANZ, NAB and Westpac remain comparison filters. The former keyword/Mode C prototype is historical.

[Open the authenticated app](https://commbank-customer-insights-7405609252709772.12.azure.databricksapps.com).

## Classification lenses

- **Product areas** (default): supplied profile, primary product area, secondary topic and sentiment labels. The current CommBank source has 10,413 records: Business 182, Personal 2,332, General 7,899. The Business competitor evidence sample contains ANZ 63, NAB 33 and Westpac 46 records.
- **Issue categories**: the original three profile values and eight issue categories, from the supplied categorized CommBank product. Business has 297 records. Product-label sentiment is joined as a separate annotation; Product profile/issue labels never replace YAML labels.

The two products join one-to-one on a hash of source, user, normalized date and full comment. Their profile labels disagree on 1,717 records. Duplicate or missing join keys fail closed. Counts and source bounds are computed locally from the packaged snapshot; there is no runtime SQL warehouse fallback. Both inventories currently cover 1 January 2025 through 21 November 2026.

Competitor row evidence is available only for Product areas → Business. Other profiles and all Issue category scopes show **Not classified for this scope**, with null counts rather than misleading zeros. A covered scope emptied by filters correctly has zero records. Competitor primary areas are derived from the supplied secondary topic mapping.

Three featured excerpts remain above the comparison; the complete evidence list is sortable and cursor-paged. The comparison shows five supplied sentiment counts—Negative, Mixed, Neutral, Positive, Unknown. Stars on cards remain source ratings. Labels are model annotations, not verified customer identity, business size, Business Profile screen usage or model accuracy. Source misclassifications and off-topic reviews can remain.

## Fixed-sample analysis

Choose a Product Business secondary topic with a supplied summary to open **Fixed-sample business analysis**. Its 29 summary rows and 142 evidence rows are parsed independently from parallel columns. All 116 supplied per-bank/topic counts matched the current row-level evidence in the release checks.

The analysis dialog deliberately ignores current date, source and competitor filters and states its own fixed Business scope. Summary percentages are per-bank fractions, never added or averaged. Mobile-app guide text includes Westpac **New Zealand**, is indicative, and is not verified feature support for Australia. Supplied opportunities and generated suggestions are ideas for review, not confirmed CommBank feature gaps. Business+General, all-profile and feature-matrix products are not silently substituted into this Business scope.

## Clean browser address

Filters live in per-tab `sessionStorage`, survive reload and do not appear in the address bar. A new tab starts at defaults. Existing long hash links are consumed once, migrated and removed with `replaceState`. Explicit empty sources stay empty; a nonempty saved source selection that is entirely obsolete resets to current sources with a notice on boot. There is no filtered-view share-link feature. Local Jira drafts remain in their existing browser-local storage and can be edited/exported; nothing is sent to Jira.

## Running and checking locally

Node.js 22 or later and the pinned official `@duckdb/node-api` dependency are required. The lockfile includes the Linux x64 binding used by Databricks Apps.

```sh
git clone https://git.epam.com/epm-aiin/cba_customer_intelligence.git
cd cba_customer_intelligence
npm ci
PORT=5189 npm start
```

Data reads require no Azure CLI, SQL, warehouse or Unity Catalog credentials. Azure CLI authorization is obtained only in memory when explicitly calling the existing model endpoint locally. The listener is loopback-only. For isolated invented-data browser/API checks, run a second server:

```sh
MOCK_DATABRICKS=1 PORT=5193 npm start
npm run check
node qa/duckdb-contract-tests.mjs
node qa/duckdb-runtime-tests.mjs
node qa/duckdb-fail-closed.mjs
node qa/calendar-classified.mjs
```

`qa/duckdb-runtime-tests.mjs` disables network fetches and checks the real local snapshot. `qa/duckdb-model-smoke.mjs` explicitly calls the existing DBX model over DuckDB evidence. `qa/duckdb-browser.js` exercises synthetic interactions on port 5193 and captures real DuckDB layouts on port 5189. Screenshots belong in the project's `output/playwright/` directory. Earlier `classified-*` reports are preserved as migration baselines, not current runtime verification.

## Lossless snapshot and refresh

All **10 landing application tables and 68,919 complete source rows** are preserved: four raw-bank tables, both CommBank label tables, competitor_reference, intel_business_general, intel_business_only and mobile_app_feature_matrix. Native `landing` tables retain original column names/order and typed values. `source_archive` additionally retains each exact canonical source JSON row, including duplicate multiplicity, full comments, replies and user IDs. `source_schema` preserves source types, nullability and pinned Delta versions. The application projection contains 10,555 rows; its existing citation IDs were exported from one Spark statement and are never recomputed in DuckDB. No source tables were modified or deleted.

The source export records every visible application object and rejects unsupported/non-Delta source types, row filters, column masks or a non-UTC session. Source-side row counts, distinct-row counts, character totals and independent SHA-256 multiset sums reconcile the download. The builder then verifies archive bytes, every native cell and every column's NULL count. BigInt/decimal types are rejected rather than silently coerced. See `qa/duckdb-lossless-verification.json`.

The database is 36,450,304 bytes, packaged in 12 private parts under `data/`, with per-part and complete-file SHA-256 checks. The server assembles it into a private temporary file, opens it read-only, disables external access/extensions and bounds memory, threads and concurrent queries. Missing/corrupt snapshots fail startup before listening. These files are outside `public`; neither source tables nor archive files have an HTTP download route. The existing public API keeps bounded, redacted excerpts.

The snapshot is fixed at the timestamp and per-table versions in its manifest; it does not automatically track later Databricks updates. To refresh, retain the previous `private-export/`, `data/` and release proofs in a dated private backup, then run the operator-only scripts with an authorized source identity:

```sh
node scripts/export-duckdb-source.mjs
node scripts/build-duckdb-snapshot.mjs
```

The exporter resumes a pinned snapshot if its manifest already exists. A fresh snapshot requires a fresh export directory; never silently reuse old files for a new version. Export scripts and their remote SQL helper are excluded from deployment. Unrelated inference payload logs and Unity Catalog control-plane grants are not application data and are not copied. Original source files and historical release snapshots remain intact.

## API and evidence contract

- `GET /api/health`, `GET /api/ready`: liveness and validated snapshot/taxonomy readiness.
- `GET /api/meta`: lenses, profiles/issues/topics, snapshot cohort totals, union date/source bounds and join integrity.
- `GET /api/summary`: current-filter bank counts, supplied sentiment bins, monthly record trend and disjoint topic counts.
- `GET /api/records`: up to 50 redacted excerpts, keyset cursor, optional validated bank filter.
- `GET /api/records/:id?lens=…`: namespaced evidence lookup; historical 32-hex citations return an explanatory 404.
- `GET /api/benchmark?topic=…`: fixed sample only; rejects date/source/competitor parameters.
- `POST /api/assistant`, `POST /api/suggestions`: explicit requests over at most 12 current-filter excerpts, strict citation membership, visible errors on failure.

Filters are `lens`, `profile`, `issue`, `topic`, `sources`, `competitors`, `from`, `to`, `sort`. SQL values are bound parameters; table identifiers are fixed server-side; no warehouse is used. CBA and competitor IDs retain their original namespaced Spark hashes and duplicate ordinals. User IDs, replies and full comments never enter browser/model payloads. The materialized UI projection retains the existing 240-character prefix, then email/number pattern redaction and a second cap are applied. This is not a guarantee of complete de-identification or semantic citation entailment. Model excerpts may be logged by the endpoint/provider. The newest/CommBank-first top-12 sample is not a representative survey.

## Deployment and access

Databricks Apps continues to provide hosting, login and the existing app ACL. Data APIs require the forwarded viewer identity and use isolated cache namespaces; they no longer need SELECT/warehouse/Unity Catalog permissions or an access token. Only explicit Ask/Generate calls request per-user authorization for the existing model endpoint. That model integration remains Databricks-based. Local data is portable with the app; hosting login and model authorization are separate concerns.

OAuth scopes remain `sql:restricted-query` and `model-serving`, with no attached resources, to preserve the reviewed app configuration; the unused SQL scope grants no runtime SQL path. CSP (including the annotation-style hash), model limits and local-only Jira drafts are preserved. Synthetic mode is refused in a deployed app.

The existing app audience covers 2,403 active exact `epam.com` identities in the authorized sharing snapshot. This is point-in-time access; future identities are not automatically enrolled. Non-owner model access remains subject to existing model permissions. The 2,404-entry complete ACL is preserved exactly on deployment.

Use `scripts/stage-deployment.mjs`, then `scripts/redeploy-databricks.mjs --dry-run` and the reviewed `--apply` flow. The exact allowlist now includes the package lockfile and private checksummed snapshot parts, alongside runtime/config/public assets. It excludes export scripts, original NDJSON, docs, QA, backups and node_modules. Databricks installs the Linux dependency during build. The release contains 35 files in an immutable source snapshot; remote bytes and ACL/scopes/resources are independently verified. `docs/duckdb-rollback-plan.json` identifies the prior verified source release. Never use the historical app-creation operator to update this app.

## Current release evidence

- `docs/fable-duckdb-plan.md`, `docs/fable-duckdb-review.md`: migration plan and Fable quality gate.
- `qa/duckdb-lossless-verification.json`: all source columns/rows/NULLs, native values and exact archive reconciliation.
- `qa/duckdb-runtime-results.json`: 82 checks with network disabled, 1,263 paged requests, 62,904 record visits, all 29 analyses and every citation ID preserved.
- `qa/duckdb-contract-results.json`: 15 API/contract/auth groups.
- `qa/duckdb-browser-results.json`: 26 browser checks, source persistence, clean URL, calendar, collapse, draft flow, desktop/mobile layout.
- `qa/duckdb-fail-closed-results.json`: corrupt/missing snapshot startup refusal and private-file route checks.
- `qa/duckdb-model-results.json`: actual Generate and Ask HTTP 200 on 11 Statements excerpts with resolving citations.
- `qa/duckdb-migration-summary.json`, `data/snapshot-manifest.json`: source controls, fixed versions and portable snapshot metadata.
- `docs/databricks-redeploy-proposal.json`, `qa/databricks-redeploy-applied.json`, `qa/databricks-redeploy-verification.json`: current release and remote-byte/ACL verification.

DuckDB deployment succeeded on 24 November 2026. The authenticated hosted browser verified readiness, clean-URL reload, 20→40 paging, CBA/ANZ citations, Generate and Ask. Remote-byte and ACL verification passed 8/8; see `qa/duckdb-deployed-browser-verification.json` and `qa/databricks-completion-status.json`. The previous deployment remains available at the immutable workspace source folder named in `docs/duckdb-rollback-plan.json`. Historical local prototypes and backups remain in the original development workspace.

Fable planning and source/QA review are recorded in `docs/`. Credentials are not included in the repository.

## Repository layout

`server.mjs`, `server/` and `public/` are the app. `config/` preserves the original taxonomy. `data/snapshot-manifest.json` and its 12 binary parts are required, complete runtime data; do not replace them with UI excerpts. `scripts/` contains refresh, packaging, deployment verification and rollback operators. `qa/` records the migration and supplies checks. The app is deployed from this repository root.

Run `npm ci` before the checks. `qa/duckdb-runtime-tests.mjs` runs directly against the packaged snapshot with network calls disabled. The contract checks expect a separate `MOCK_DATABRICKS=1 PORT=5193 npm start`; the fail-closed/model scripts use the real local app on port 5189. Browser automation expects the Playwright CLI. Model smoke tests make explicit real model calls and require local Azure CLI authorization.

## UI review follow-up

The visible taxonomy tab is **Issue categories** (the internal `yaml` key is retained). Record trend shows numeric values, a scale and month/count overlays available through pointer hover or keyboard focus. `qa/issue-trend-browser-results.json` records 26 real-data browser checks, including the client Business feature-enhancement view and readable chart text at 1,280, 1,440 and 1,920 pixels. `docs/fable-issue-trend-final.md` records Fable approval. See [ARCHITECTURE.md](ARCHITECTURE.md) for the SA handoff.

## Container deployment

Build the root `Dockerfile` for a matching Linux architecture. [Docker/AWS instructions](docs/DOCKER.md) cover local preview, authenticated proxy configuration, health checks, private ECR publishing and ECS handoff. The complete DuckDB snapshot is bundled; AWS authentication and the existing Databricks model integration still need explicit setup. No AWS resources are provisioned.
