**Verdict: APPROVE for arm64, with no blocking defects; amd64 is still open.** `qa/docker-smoke-amd64.json` did not exist when I read the tree, so the gate is not closed for that variant until its results land. I only read files; nothing was built, run or edited.

The three code changes (closed `APP_HOST` set, exact `APP_ORIGIN` outside Databricks, forwarded viewer required in user mode) match your description. Bad configuration and an unwritable temp directory both exit before `listen`. The arm64 report shows 30 of 30 checks passing with snapshot `5ac0…` and 10 tables / 68,919 rows.

## Fixes worth making (small, none blocking)

1. **`.dockerignore` is probably looser than the docs claim.** By my reading of Docker's matching, a bare `!public/` re-includes the whole directory, which makes the per-extension lines below it redundant. The same applies to `!server/`, `!config/`, `!data/` and `!container/`.
   - **Effect:** `COPY public/` and `COPY server/` would ship anything later dropped into those directories, and all of `data/` enters the build context. That would undercut the "admits only runtime files" and "no private exports in the build context" statements in `docs/DOCKER.md`.
   - **Fix:** delete the five bare directory lines and keep the file-level patterns. Then rebuild and confirm with a stray file such as `public/x.txt` that it stays out.
   - I could not run a build to confirm this, so treat it as verify-then-fix.

2. **Two smoke exclusion probes pass vacuously.** `public/assets/axe.min.js` and `public/data` do not exist on the host, so their absence from the image proves nothing. I could not list the other probed paths.

3. **One smoke check name overstates what it tests.** "Build context excludes scratch data…" at `qa/docker-smoke.mjs:34` inspects the image filesystem, not the build context. Rename it to "Image excludes…", or add the stray-file probe from item 1.

4. **The report's `base` field is self-attested.** `qa/docker-smoke.mjs:43` hard-codes the digest instead of reading it from the `Dockerfile`, so the JSON would keep claiming the old base after a bump. Parse the `ARG` line or drop the field.

5. **The startup-rejection checks only assert exit code 1.** At `qa/docker-smoke.mjs:40-41` any crash would count as a pass. Also assert that `e.stderr` contains the expected message (`APP_ORIGIN must be…`, `APP_HOST must be…`, and so on).

6. **One recorded check name misleads.** The fourth case is logged as "rejected AUTH_MODE=local", which reads as contradicting "Explicit local preview works". Include the paired `APP_ORIGIN=https://…` in the name.

7. **The ECS temp-storage step needs one more sentence.** Step 4 of `docs/DOCKER.md:79` says to ensure UID 1000 can write, but not how. As I recall the AWS bind-mount docs, a Fargate task volume mounts root-owned 0755 unless the image pre-creates the path with the right ownership and declares it as a `VOLUME`. A plain volume at `/tmp` would therefore make the app refuse to start. Suggested wording: mount a dedicated path that the image creates as `node`-owned and declares as a `VOLUME`, and point `TMPDIR` at it. Confirm against current AWS docs before wording it.

## Optional

`RUN chmod -R a=rX /app` in the `Dockerfile` duplicates `node_modules` into a second layer. `COPY --chmod` would avoid that; it is only an image-size matter.