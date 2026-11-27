## Verdict: APPROVE to proceed to the Databricks deployment step, with conditions

I found no blocking code defect in the files you listed. This was read-only: I ran nothing, so file hashes against the QA `sourceHashes` and the contents of `server/` beyond the files I read are unchecked.

### What the evidence supports

| Area | Result | Evidence |
|---|---|---|
| No-loss completeness | Pass | Table rows sum to 68,919 and 12 parts sum to 36,450,304 bytes. Archive SHAs match between `source-manifest.json`, `snapshot-manifest.json` and the lossless report. Spark-side hash sums, distinct counts and character counts are reconciled at `export-duckdb-source.mjs:52-53`; archive bytes and every native cell at `build-duckdb-snapshot.mjs:31-40`. |
| Source controls | Pass | The export aborts on non-managed objects, non-UTC, or any row filter or mask (`export-duckdb-source.mjs:13-17`). Versions are pinned per table. The manifest contains only STRING, INT, DOUBLE and DATE. |
| Stable IDs | Pass | Evidence comes from one statement with chunk reconciliation (`:41-46`). 10,555 = 10,413 + 142, the join is one-to-one, and there are no duplicate competitor rows, so every `bi-…` ID ends in `-1`. Primary key is on `id`. |
| Runtime isolation | Pass | `server/auth.mjs:35` only allows serving-endpoint paths. `server/sql.mjs` only calls local DuckDB. The database opens read-only with external access and extensions off and config locked (`server/duckdb.mjs:22`). All values are bound. |
| Auth and cache | Pass | Data routes need only the forwarded user; model routes need the forwarded token (`auth.mjs:17-32`). Cache keys use a per-process HMAC namespace per user. |
| Fail-closed | Pass | The snapshot is validated before listen (`server.mjs:58`) and `/api/ready` returns 503 on failure. Fail-closed QA is 9/9. |
| Native compatibility | Pass locally | The lockfile pins `@duckdb/node-bindings-linux-x64` (glibc) at 2.0.1-r.1 with integrity hashes. |
| Private staging | Pass | The stage allowlist, the operator's re-check (`redeploy-databricks.mjs:25-28`), the static root limited to `public/`, and `/data/` returning 404. |
| Deployment safety | Pass | Mutations are limited to mkdirs/import inside the new release folder and one deployment POST (`:43`), with `overwrite:false`. ACL, scopes and resources are fingerprinted before, during and after. |
| UI parity | Pass | Both screenshots show the DuckDB provenance line, three cards, and the calendar, collapse and dual-taxonomy controls intact. |

### Release conditions

1. **Rollback has no tooled path.** `redeploy-databricks.mjs` can only deploy the newly reviewed folder, so it cannot run the rollback in `docs/duckdb-rollback-plan.json`. Before `--apply`, write down the exact manual call (POST deployments with the 09-46-17 folder, SNAPSHOT) and confirm that folder still exists.
2. **A failed deploy is not auto-recovered.** The script stops on FAILED. Whether the previous deployment keeps serving is unverified, so deploy in a quiet window with condition 1 ready.
3. **Review the dry-run file list.** Staging takes every `.mjs`, `.js` and `.json` under `server/`. Confirm the proposal contains only the expected files plus the manifest and 12 parts.
4. **Acknowledge the authorization change.** Data access is now governed by the app ACL (about 2,400 principals with CAN_USE), not Unity Catalog grants. The full raw archive, including user IDs and replies, sits in the release folder and the container's `/tmp`. The API only reads `app_evidence` and `landing.intel_business_only`, redacted and bounded, but revoking catalog access no longer revokes app access.

### Startup risks to watch on Databricks (constraints, not defects)

- **npm registry access:** the build must download the native binding. A blocked registry fails the build, not the runtime.
- **`health_check` in `app.yaml`:** still not proven to be honored by the platform. If it is ignored, the validate-before-listen step still fails closed.
- **Writable temp directory:** startup needs about 36 MB in `os.tmpdir()`. An unwritable `/tmp` means the process exits, by design.
- **Load:** four concurrent queries, a queue of 48, and a 150-entry cache shared across all users. Bursts return 503 `DATA_BUSY` or `CACHE_BUSY`; results stay correct.

### Minor, non-blocking

- Browser interaction checks ran in synthetic mode; only the layouts ran against live DuckDB. Repeat one reload, paging and citation pass on the deployed app.
- At 390 px the "Ask about this evidence" button covers the "Supplied classification labels" footnote.
- `source_schema.column_ordinal` is 1-based while the source ordinals are 0-based; the verbatim manifest is kept in `snapshot_manifest`.
- The export type allowlist also accepts BOOLEAN, and the build maps BIGINT; neither occurs in the data.
- The lossless report has an empty `checks` array, and `app_evidence` shows `nullCountsVerified: false`; the cell-by-cell compare covers nulls.
- `snapshotInfo` is imported but unused at `server.mjs:2`.
- The temp directory's owner and mode are not checked if it already exists, and the file is not re-hashed after the write.

### Post-deploy gate

- `/api/ready` returns 200 with `engine: DuckDB`.
- One `bi-…` and one `cba-…` citation resolve.
- One Generate and one Ask succeed with the user's token.
- The ACL, scopes and resources fingerprint is unchanged in `qa/databricks-redeploy-applied.json`.