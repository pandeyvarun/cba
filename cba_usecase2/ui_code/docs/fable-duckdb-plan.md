**Verdict: the plan is sound, but eight blockers need closing before or during implementation.** I read the six server files, both scripts, `package.json` and `app.yaml`; nothing was run and no Databricks facts were checked live.

## Blockers

1. **Deploy scripts reject the snapshot and lockfile.** `scripts/stage-deployment.mjs:9,40-41` and `scripts/redeploy-databricks.mjs:25` allowlist only `server/*.{mjs,js,json}`, `public/*` and five named files.
   - Add `package-lock.json` and a private sibling directory (e.g. `snapshot/part-NNN.bin` plus a manifest) to both.
   - Skip the UTF-8 secret regexes for the binary parts and scan the exported payload text before the build instead.

2. **Chunk size is set by the operator, not only by the workspace limit.** `redeploy-databricks.mjs:74,81` uploads base64 through `workspace/import` and verifies through `workspace/export`. From memory both cap near 10 MB per request and Apps rejects source files over 10 MB, so use about 5 MiB raw parts. Confirm the limits before fixing the size.

3. **The native dependency install is unproven.** `package.json` already pins `@duckdb/node-api` at `2.0.1-r.1`.
   - Confirm that version exists and that the lockfile generated on macOS includes the linux-x64 optional binding.
   - Confirm the Apps build can reach the npm registry from this workspace.
   - The operator forbids creating a pilot app, so prepare a reviewed rollback proposal pointing at the current release folder first.

4. **Readiness may not gate the deployment.** `app.yaml` declares `health_check: /api/ready`, but the session notes list it as unverified. In deployed mode, exit non-zero before `listen` on any snapshot, schema or hash failure. The operator's `appState==='RUNNING'` check then catches it.

5. **The evidence snapshot must come from one statement execution.** The `bi-` IDs use `row_number() OVER (PARTITION BY evidence_key ORDER BY evidence_key)` (`classified.mjs:36`), which is arbitrary within duplicate groups.
   - Re-running the query per page can assign different IDs on different pages.
   - Fetch all chunks of one `statement_id` (or CTAS once). Do not reuse `sql()`, which is capped at 2,000 inline rows.
   - Add `VERSION AS OF` to every table reference in `classifiedQuery`, including the business-table join at `data.mjs:47`.

6. **Never recompute IDs or join keys in DuckDB.** Spark's `to_json`, `try_cast(... AS DATE)` leniency and `sha2` inputs will not reproduce byte-for-byte. Materialise `id`, `join_key`, `evidence_key`, the topic map, benchmark flags and integrity counts on the Spark side. Put a primary key on `evidence.id`.

7. **The completeness proof has holes as proposed.**
   - **Circular hash:** compute the source multiset hash inside Spark (e.g. a hash over sorted per-row `sha2(payload)`), independently of the exported bytes.
   - **Row filters and column masks:** check `information_schema` for both on all 10 tables and hard-fail, or the export silently loses data.
   - **Time zone:** the Statement API has no session, so `SET TIME ZONE` cannot be used. Assert `current_timezone()` is UTC, or cast timestamps explicitly.
   - **Type inference:** load typed tables with an explicit schema from `information_schema.columns`, with auto-detect off. Otherwise strings like `"05"` or `"2024-1-5"` get coerced.
   - **Number precision:** never pass payloads through JS `JSON.parse`; BIGINT and DECIMAL lose precision.
   - **Roundtrip check:** compare typed values against payloads value by value, since DuckDB's JSON text will differ from Spark's.
   - **Inventory:** fail on any table in the schema that is neither one of the 10 nor explicitly excluded. Fail on any that is not a Delta table, since it has no version to pin. Confirm the exporting identity may run `DESCRIBE HISTORY`.

8. **The auth change has a cache leak.** `auth.mjs:20` requires the forwarded token on every route, and the cache namespace is the token digest.
   - Data routes should require `x-forwarded-user` when deployed and use a fixed local principal on 127.0.0.1.
   - Only the model routes should need the token.
   - Suggestions are cached via `cached(auth,…)` (`model.mjs:28`). If the data cache goes global, keep that one per-user, or one user's model output is served to another without their own endpoint check.
   - Remove `/api/2.0/sql/` from the path allowlist at `auth.mjs:31` so SQL is impossible by construction.

## Recommendations

- **Authorisation model:** the app ACL becomes the only gate on this data, and Unity Catalog grants and audit no longer apply. The raw archive (user IDs, unredacted text) sits in the app container and the release folder. Keep it in a separate schema that no API statement references, and test for that.
- **Unused SQL scope:** preserving scopes keeps the SQL consent prompt. Leave it for this release, because the operator's `sameConfig` check blocks changes, and remove it later.
- **DuckDB runtime:** assemble parts into a `0600` temp file, verify the SHA, and open it `READ_ONLY`. Set an explicit `memory_limit` and thread count, disable external access and extension autoload, and lock the configuration. Build the file with the same pinned DuckDB version.
- **Query translation traps:**
  - `date_format` becomes `strftime`.
  - `:name` parameters become `$name`.
  - `COUNT(*)` returns BigInt, which breaks `JSON.stringify`.
  - Keep `CAST(record_date AS VARCHAR)`.
  - Set `NULLS FIRST` explicitly.
  - Check `substring` parity on emoji text for the benchmark's 1,200 and 1,800 character cuts.
- **Provenance and wording:** `provenance().asOf` is `new Date()` (`data.mjs:11`). Make it the snapshot timestamp plus pinned versions. Replace the "live data", "warehouse warming" and "authorize SQL" strings. Drop `DATABRICKS_WAREHOUSE_ID` from `app.yaml`.
- **Parity goldens:**
  - Capture from the live path only while table versions equal the pinned ones, checking before and after.
  - Cover every topic and filter combination for meta, summary and benchmark.
  - Page records to exhaustion in all three sorts, and fetch each of the 10,555 IDs.
  - Compare `bi-` duplicate groups ignoring the suffix, and exclude `asOf`.
  - Run the DuckDB side with `fetch` stubbed to throw on anything but serving invocations.