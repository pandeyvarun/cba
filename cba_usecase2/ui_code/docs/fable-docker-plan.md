**Verdict:** the plan is sound and needs no scope expansion. I read only the four files, so anything about the lockfile, `data.mjs`/`model.mjs`, the QA scripts and the Databricks bundle config is a check to run, not a finding.

## Code changes (three, all small)

1. **Identity fix, `server/auth.mjs:17-18`.** Confirmed: the viewer is gated on `deployed()`, so Docker with `AUTH_MODE=user` serves every data route as the shared `local-loopback` principal. Gate both lines on `authMode()==='user'` instead. `authMode()` already returns `user` when deployed, so Databricks behaviour is unchanged.
2. **`APP_HOST`, `server.mjs:56`.** Use `deployed() ? '0.0.0.0' : (APP_HOST || '127.0.0.1')`. Validate at startup against a closed set (`127.0.0.1`, `0.0.0.0`) and throw otherwise.
3. **`APP_ORIGIN`, `server.mjs:17-19`.** Confirmed needed: outside Databricks the allowed origin is `http://` + Host, so every model POST behind a TLS proxy returns 403.
   - Parse once at startup and require `new URL(v).origin === v` with an http/https protocol. Strict equality matters because `URL` silently normalises `:443`, trailing slashes and paths.
   - Apply it only when `!deployed()`, so the Databricks branch stays byte-for-byte the same.

## Blockers to clear before coding

- **Lockfile and `--ignore-scripts`.** The DuckDB binding should arrive as a prebuilt optional platform package, so skipping scripts should be fine. Confirm `package-lock.json` has entries for `@duckdb/node-bindings-linux-x64` and `-linux-arm64`; a lockfile generated on macOS can omit them, and then `npm ci` succeeds but the import fails at runtime.
- **Image architecture.** Colima on Apple Silicon builds arm64, while Fargate defaults to x86_64 and would fail with an exec format error. I recommend targeting Graviton (`runtimePlatform: ARM64`), so the image you smoke-test is the image you ship. The alternative is `buildx --platform linux/amd64`, which runs slowly under emulation and leaves the shipped image effectively untested locally.
- **Runtime file inventory.** `server.mjs` statically imports `data`, `model`, `classified` and `mock`, so copy all of `server/`. Before writing the COPY list, find every file read through `import.meta.url` in those modules, especially the taxonomy source behind `taxonomyValid`. A missing one gives a 503 on `/api/ready`, not a build error.
- **Databricks release manifest.** Check that adding `Dockerfile`, `.dockerignore` and `docs/DOCKER.md` does not change the hashed Databricks bundle or sync set; exclude them there if it does.
- **Existing QA callers.** Any script that runs `AUTH_MODE=user` locally without `x-forwarded-user` will start getting 401 on data routes after change 1.

## Pitfalls

**Auth and network**
- **User mode is not functional on AWS yet.** Any non-empty `x-forwarded-user` is accepted. A plain ALB neither sets that header nor strips a client-supplied one, so without a validating adapter real users get 401 and anyone who can reach the container can spoof it. The docs should say this outright, not only "restrict ingress".
- **Model token.** `x-forwarded-access-token` must be a Databricks-audience token for the hardcoded Azure workspace. The task also needs outbound access to that workspace, and its IP access lists may reject AWS addresses.
- **Local mode in the container is data-only.** The slim image has no `az`, so model routes return `LOCAL_AUTH_REQUIRED`. The container must bind `0.0.0.0` internally, so the only loopback protection is `-p 127.0.0.1:8080:8080`. A cheap guard is to throw at startup when `AUTH_MODE=local` is combined with an https `APP_ORIGIN`.
- **Check order.** `authenticate` runs before the origin check (`server.mjs:34-35`), so a 403 test must send both forwarded headers or it will only ever see 401.

**Container runtime**
- **Healthcheck.** Use `127.0.0.1` in the URL, not `localhost`, which can resolve to `::1` while the server listens on IPv4 only. `/api/ready` and `/api/health` are pre-auth and GET-only, which suits an ALB. ECS ignores the Dockerfile `HEALTHCHECK`, so the docs need the task-definition equivalent and a start period that covers the snapshot load.
- **Read-only root filesystem.** `duckdb.mjs:18-21` writes the full snapshot to `os.tmpdir()`. Locally, use `--read-only --tmpfs /tmp`. Fargate, as far as I know, does not support the `tmpfs` parameter, so mount a task volume there, or elsewhere via `TMPDIR`, which needs no code change. Do not share that volume between tasks: the temp file is named by pid, and every container is pid 1.
- **Memory.** Startup holds roughly twice the snapshot in buffers, plus the tmpfs copy (which counts as memory), plus DuckDB's 512 MB limit. My sizing suggestion is 1 vCPU and 2 GB; do not go below 1 GB plus three times the snapshot size.
- **Shutdown.** There is no SIGTERM handler and node runs as pid 1, so stopping waits for the full kill timeout. Document `--init` and `initProcessEnabled: true`; no code needed.
- **Task count.** The identity hash key is random per process (`auth.mjs:4`), so any per-user state is per task. Document `desiredCount: 1`.

**Image contents**
- **`.dockerignore`.** It must sit at the build context root (`cba_customer_intelligence/`). With a `*` allowlist, directories need `!data/**`-style re-includes. `server.mjs:47` implies `public/data/` and `public/assets/axe.min.js` exist; leave them out unless something needs them at runtime.
- **Private data.** The image contains the private snapshot, so the ECR repository must be private. Do not `--chown` the app files; they should stay root-owned and read-only to `node`.

## Verification (Colima)

1. Build natively, then confirm the snapshot is unchanged by comparing `sha256sum data/*` in the image with the host. A passing `/api/ready` is also proof, since startup re-hashes every part.
2. Default run (`AUTH_MODE=user`):
   - `/api/ready` and `/api/health` return 200 with no headers.
   - `/api/meta` returns 401 with no headers and 200 with `x-forwarded-user`.
   - POST `/api/assistant` returns 401 with no token, and 403 with a token but the wrong Origin.
3. `APP_ORIGIN=https://example.test`: the https origin passes the origin check and `http://<host>` returns 403.
4. Invalid `APP_ORIGIN`, `APP_HOST` or `AUTH_MODE` each exit non-zero before listening.
5. `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --init` reaches healthy; without the tmpfs it exits non-zero.
6. `docker stop` returns promptly with `--init`.
7. Databricks regression: with `DATABRICKS_APP_PORT` set, the server binds `0.0.0.0`, uses user auth, and ignores `APP_HOST` and `APP_ORIGIN`. Rerun the existing QA suite.
8. `git status` shows `portable/` untouched and out of the build context.