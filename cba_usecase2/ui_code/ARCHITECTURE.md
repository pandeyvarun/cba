# CommBank Business Customer Insights — SA handoff

## 1. Purpose and current architecture

This hackathon app helps product teams inspect classified banking feedback, compare supplied evidence for CommBank, ANZ, NAB and Westpac, and generate reviewable product proposals. CommBank is the fixed focal bank. The dashboard is an evidence exploration tool: record counts are not unique customers, market share or independently verified feature availability.

The frontend and backend run as one **Node.js application hosted in Databricks Apps**. **All application data reads use the DuckDB database packaged with the app.** There are no runtime reads from a SQL warehouse or Unity Catalog tables. The existing Databricks model-serving endpoint remains responsible for the explicit Ask and Generate actions.

| Component | Implementation | Responsibility |
|---|---|---|
| Browser UI | Native JavaScript ES modules, HTML, CSS, inline SVG | Filters, classification lenses, calendar, numeric trend chart, evidence dialogs, suggestions and local draft queue |
| HTTP facade | `server.mjs`, Node built-in HTTP server | Static asset boundary, API routing, request validation, readiness and error responses |
| Data service | `server/data.mjs`, `server/sql.mjs` | Metadata, validated filters, counts, trends, cursor paging, citation lookup and supplied business summaries |
| Embedded database | `server/duckdb.mjs`, pinned `@duckdb/node-api` | Validated, read-only local SQL execution with bounded concurrency and memory |
| Authentication | `server/auth.mjs` | Viewer identity for data; separate user authorization for model calls |
| Model integration | `server/model.mjs` | Bounded evidence selection, grounded prompt, response validation and model limits |
| Hosting | Databricks Apps, `app.yaml` | HTTPS entry point, sign-in, app permissions and process lifecycle |
| Refresh/release operators | `scripts/` | Version-pinned source export, lossless database build, staging, existing-app deployment and rollback |

There is no frontend build framework, separate API deployment or external database service. Databricks installs the pinned Node dependencies, then starts `node server.mjs` from the repository root.

## 2. Request and data flow

1. A viewer opens the hosted app. Databricks authenticates the viewer and enforces the app's `CAN_USE` permission.
2. The browser loads static assets from `public/`, then requests `/api/meta`.
3. The server validates the embedded snapshot, extracts the forwarded viewer identity and reads local DuckDB metadata. No SQL access token or warehouse permission is needed for this step.
4. Filter changes request `/api/summary` and a first page from `/api/records`. The server validates the lens, profile, issue, topic, sources, banks and inclusive dates against the metadata, then binds values into server-owned DuckDB queries.
5. The browser displays three featured excerpts, bank/sentiment counts and monthly record totals. The chart's visible values and hover/focus overlay describe record counts for the currently selected filters. The expandable table provides the complete monthly values.
6. Opening all excerpts loads cursor-paged results. Opening a citation requests its stable record ID through the same data service.
7. Only clicking Ask or Generate calls the model endpoint. The backend reads up to 12 selected excerpts from DuckDB, sends the bounded evidence to the model, validates the result and returns it to the UI.
8. Creating a Jira draft updates browser-local storage. No Jira API is called.

The browser never receives a database path, database download URL, warehouse connection or model credential. It cannot submit arbitrary SQL.

## 3. Data model and lossless packaging

The packaged snapshot contains **10 original application tables and 68,919 complete source rows**:

| Original table in `landing` | Rows |
|---|---:|
| `anz_user_comments` | 11,556 |
| `commbank_user_comments` | 20,006 |
| `nab_user_comments` | 7,482 |
| `westpac_user_comments` | 8,814 |
| `commbank_user_comments_categorized` | 10,413 |
| `comments_classified` | 10,413 |
| `competitor_reference` | 29 |
| `intel_business_general` | 29 |
| `intel_business_only` | 142 |
| `mobile_app_feature_matrix` | 35 |

Native DuckDB `landing` tables retain the original column names, order and primitive values. `source_archive` retains the exact exported JSON for every row, including full comments, replies, user IDs, NULLs and duplicate multiplicity. `source_schema` and the verbatim snapshot manifest retain source schema/version information. The preservation archive is private and has no HTTP download/query endpoint.

The UI uses an additional **10,555-row `app_evidence` projection**: 10,413 joined CommBank records and 142 supplied competitor evidence records. `app_metadata` retains the verified lens inventory, topic mapping and join integrity. Fixed-sample analysis reads the relevant summary columns from `landing.intel_business_only`. Other archived products are retained in full; they are not silently substituted into the current UI scope.

The current database is **36,450,304 bytes**, split into 12 private binary parts under `data/` for source-upload compatibility. `data/snapshot-manifest.json` names and hashes every part and the complete database. Parts are deployment packaging, not separate databases.

### Refresh and completeness controls

The operator-only exporter pins each source Delta version, checks the object inventory, UTC timezone, row filters and column masks, and exports every original column. It does not truncate, deduplicate or delete source rows. Unsupported types fail rather than silently coerce.

Source-side row counts, distinct-row counts, character totals and independent SHA-256 multiset checksums reconcile the export. The builder verifies the archive bytes, every native cell and every column's NULL count. Evidence IDs are materialized from one Spark statement and all of its result chunks; DuckDB does not recreate Spark hashes or duplicate ordinals. A primary key protects the materialized evidence IDs.

The snapshot is fixed. New upstream records/classifications require a deliberate export, rebuild, validation and app release. The original Databricks tables are unchanged. Previous immutable releases remain available for rollback.

## 4. Classification and comparison semantics

**Product areas** and **Issue categories** are two independently supplied classification lenses. The latter comes from the supplied YAML taxonomy; the internal API/storage key remains `yaml` for compatibility. The visible label is `Issue categories`.

The two CommBank label tables join one-to-one on a fingerprint of source, user, normalized date and full comment. The snapshot has 1,717 profile-label disagreements; the app preserves both interpretations rather than overwriting one. A profile label does not prove actual Business Profile screen usage or business size.

- Product areas uses product profile, primary area, secondary topic and sentiment annotations. CommBank profile counts are Business 182, Personal 2,332 and General 7,899.
- Issue categories uses the original profile and eight issue categories. Its Business cohort has 297 CommBank records. Product-label sentiment is joined as a separate annotation.
- Competitor row evidence exists only for Product areas → Business: ANZ 63, NAB 33 and Westpac 46 before date/source filters. Other profiles and the Issue categories lens show unavailable competitor coverage as NULL, not zero.
- Supplied sentiment has Negative, Mixed, Neutral, Positive and Unknown bins. Source star ratings remain separate.
- The 29 fixed-sample business analyses explicitly ignore current date, source and competitor filters. Their own scope is shown. Supplied percentages are not added or averaged across banks. Westpac guide material refers to New Zealand and is not verified Australian feature support.

Stable IDs use `cba-…` and `bi-…-ordinal` namespaces. They are used consistently by paging, lookup, model citations and local drafts. Historical pre-classification IDs return an explanatory response rather than resolving to unrelated records.

## 5. API contract and browser state

| Method and route | Behavior |
|---|---|
| `GET /api/health` | Process liveness |
| `GET /api/ready` | Snapshot and taxonomy readiness; reports `engine: DuckDB` |
| `GET /api/meta` | Lenses, profiles, issues, topics, date/source bounds and integrity metadata |
| `GET /api/summary` | Current-filter counts, sentiment bins, topic counts and monthly trend |
| `GET /api/records` | Up to 50 redacted excerpts, optional bank scope and keyset cursor |
| `GET /api/records/:id` | Stable citation lookup, with selected lens |
| `GET /api/benchmark?topic=…` | Separate supplied fixed-sample business analysis |
| `POST /api/suggestions` | Explicit generation of up to four reviewable proposals |
| `POST /api/assistant` | Explicit question answering over the selected evidence |

The supported filter keys are `lens`, `profile`, `issue`, `topic`, `sources`, `competitors`, `from`, `to` and `sort`. Filter identifiers and paging inputs are validated; query values are bound parameters. Sort orders use stable ID tie-breakers.

Filters persist per tab in `sessionStorage`. The address bar stays clean. Old hash links are consumed once and removed. Local drafts remain in `localStorage`, can be edited/exported and are not synchronized between devices or users. No server-side Jira queue or shared draft database exists.

## 6. Identity, model calls and data boundaries

In Databricks Apps, data routes require `X-Forwarded-User`. The hosting proxy supplies that identity; local development binds to loopback and uses a local principal. Data routes do not fetch Azure CLI credentials or require a forwarded access token.

Model routes additionally require the viewer's forwarded access token. The existing integration calls `model-serving-usecase4-gpt-4_1` on behalf of that user. Local model calls obtain an Azure CLI token only in server memory. No service-principal data/model fallback is added. A viewer can therefore read packaged evidence while still lacking permission to use the model endpoint.

The **app ACL is the access gate for packaged data**. Unity Catalog permissions no longer govern reads of the copied snapshot. The migration preserved the existing app ACL, OAuth scopes and attached-resource configuration. The unused SQL OAuth scope remains declared, but runtime code disallows SQL API paths. Non-owner model authorization must be validated separately before a broader client rollout.

Full source records remain server-private. Public evidence responses apply a 240-character cap and email/number pattern redaction, omit user IDs/replies/full comments, and escape text in the UI. This redaction is a bounded implementation, not a proof that every possible personal identifier is removed. Supplied analysis fields have their own bounded lengths and are not complete raw-source exports.

The model receives only the selected bounded excerpts and metadata. Questions and review text are treated as untrusted content. Responses must be structured JSON with citation IDs from the supplied evidence set; suggestions are tagged Proposed. Validation proves citation membership, not complete semantic entailment or classifier accuracy. The endpoint/provider may log model inputs according to its configuration.

The static server only serves `public/`; data, source archive, server modules, scripts, configuration and dependencies are not downloadable. The CSP restricts scripts, styles and connections to the app origin and retains the narrow annotation-style hash required by the review browser. Model POSTs enforce origin, content type and a bounded request body.

## 7. Runtime, failure handling and deployment

At startup, the server checks every binary part and the full database SHA-256, assembles a private temporary file, and opens it read-only. It checks the evidence inventory/IDs and source archive inventory. Missing/corrupt snapshots fail before the HTTP listener starts; no silent fallback to remote tables or synthetic data occurs.

DuckDB is configured for two threads and a 512 MB memory limit, with external access and automatic extensions disabled. There are at most four concurrent data queries and a bounded queue of 48. User-isolated caches are bounded to 150 entries with a maximum 60-second TTL. Model usage is limited to five requests per minute and one in-flight request per user. Visible retry states expose failures instead of inventing substitute results.

`MOCK_DATABRICKS=1` supports isolated invented-data checks locally and is refused in a deployed app.

The current release process is:

1. Install with `npm ci`; run relevant checks.
2. Run `scripts/stage-deployment.mjs`. Its allowlist includes runtime assets, taxonomy, lockfile, snapshot manifest and parts; it excludes scratch exports and developer artifacts.
3. Run the existing-app operator with `--dry-run`; review the file hashes, audience/config baseline and immutable source destination.
4. Preserve prior release proofs and run the reviewed `--apply`. It uploads into a new workspace source folder, verifies remote bytes and requests a `SNAPSHOT` deployment of the existing app.
5. Independently verify deployment state, source bytes, complete ACL, scopes and resources; then check the authenticated browser, readiness, citations and model actions.

The operator does not create a new app, change catalog tables or grant access. `docs/duckdb-rollback-plan.json` and `scripts/rollback-duckdb-release.mjs` identify and validate the previous verified source for emergency rollback. The current target is the immediately preceding DuckDB release: rollback keeps the same embedded dataset and does not restore warehouse queries. A code push alone does not redeploy the app; this repository does not define an automatic GitLab deployment pipeline.

## 8. Portability and architectural decisions

| Decision | Benefit | Consequence / extension point |
|---|---|---|
| Package the full DuckDB snapshot | Client does not need a data warehouse; repeatable demo; complete source retained | Fixed data until refresh; deployment size grows with source volume |
| Read-only embedded data | Simple operations and reproducible metrics | No shared application writes; large datasets/load need a new capacity decision |
| Materialize the verified evidence projection | Preserves Spark-derived IDs and the two label products exactly | Refresh must rebuild and revalidate the projection |
| Single Node process | Simple same-origin UI/API deployment | Cache and request limits are per replica, not globally coordinated |
| Explicit model actions with bounded evidence | Predictable data exposure and cost; no inference on page load | Answers use a small selected sample rather than the whole corpus |
| Local-only Jira drafts | No external write permissions needed for the demo | Drafts are browser-local; real Jira creation requires a separately authorized integration |

**DuckDB portability does not remove all Databricks dependencies.** The app still uses Databricks hosting/sign-in and the existing model endpoint. Hosting elsewhere requires a replacement authentication adapter for viewer identity, HTTPS/reverse-proxy configuration and an alternative model credential/endpoint adapter. The packaged data service itself needs neither Databricks tables nor a SQL warehouse. Node and the appropriate native DuckDB binding are still required.

Before production, agree snapshot refresh/retention ownership, allowed audience and source-data handling, model observability and evaluation, non-owner access, load targets, resilience and any real Jira workflow. These are separate decisions from this hackathon implementation.

## 9. Verification evidence

The committed QA records include the lossless transfer proof, 82 network-disabled data checks, 15 contract/auth checks, 9 corruption/private-route checks, desktop/mobile interaction checks, and authenticated deployed-model/citation verification. `docs/fable-duckdb-plan.md` and `docs/fable-duckdb-review.md` record the migration architecture and quality gate. The UI follow-up has its own Fable review and browser evidence.

For implementation details, start with `server.mjs`, `server/duckdb.mjs`, `server/data.mjs`, `server/auth.mjs`, `server/model.mjs` and `public/app.js`. For the data manifest, start with `data/snapshot-manifest.json` and `qa/duckdb-lossless-verification.json`.

## 10. Container packaging

The root Dockerfile packages the same app with production dependencies and the complete snapshot, runs as a non-root user on port 8080, and checks `/api/ready`. The image defaults to `AUTH_MODE=user`. Outside Databricks, this mode requires a trusted authenticated proxy to set the forwarded viewer header; the container is not a standalone AWS login implementation. `APP_HOST` configures the listener, and `APP_ORIGIN` configures the exact external origin behind TLS. These overrides do not change Databricks defaults. See [docs/DOCKER.md](docs/DOCKER.md) for build/run commands, temporary-storage requirements, ECR publishing and remaining identity/model integration.
