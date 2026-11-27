# Docker and later AWS deployment

The root `Dockerfile` packages the hosted Node/DuckDB app. It includes the complete 10-table, 68,919-row snapshot and existing UI; no data warehouse or database service is required. Databricks deployment is unchanged. This change does not provision or deploy AWS resources.

## Build and preview

Run commands from the repository root. Choose the same CPU architecture as the future ECS task:

```sh
# ARM64 / Graviton target (native on Apple Silicon)
docker build --platform linux/arm64 -t cba-insights:local .

# Alternatively, for an x86_64 target:
# docker build --platform linux/amd64 -t cba-insights:local .
```

Use a current Docker installation with Buildx/BuildKit for cross-platform builds. The multi-stage build uses a digest-pinned official Node 22 Debian/glibc image, installs the lockfile's production dependencies for the target platform and checks the native DuckDB driver during the build. Alpine/musl and copied macOS `node_modules` are not interchangeable with this image. `.dockerignore` admits only runtime files and the required snapshot parts.

For a **local data-only preview**, explicitly select local mode and publish on loopback:

```sh
docker run --rm --init \
  -p 127.0.0.1:8080:8080 \
  -e AUTH_MODE=local \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --cap-drop ALL --security-opt no-new-privileges \
  cba-insights:local
```

Open `http://127.0.0.1:8080`. Local mode has no sign-in and must not be used for an internet deployment. The image does not contain Azure CLI credentials or the `az` executable, so local-mode Ask/Generate cannot authenticate. The full data/filter/comparison UI works without any network data source.

The default image instead uses `AUTH_MODE=user`: readiness is public, while data APIs require a trusted forwarded viewer identity. A browser pointed directly at that default container cannot load evidence until the authentication proxy is configured.

## Runtime settings

| Setting | Container default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port inside the container |
| `APP_HOST` | `0.0.0.0` | Container listener; only this value and `127.0.0.1` are accepted |
| `AUTH_MODE` | `user` | Forwarded identity required; `local` is for a loopback-published preview |
| `APP_ORIGIN` | unset | Set to the exact external HTTPS origin, e.g. `https://insights.example.com`, behind TLS termination |
| `TMPDIR` | OS `/tmp` | Must be writable for private snapshot reconstruction |

`APP_ORIGIN` accepts an exact HTTP(S) origin, without a path, credentials or trailing slash. HTTPS origins are refused with local auth. Databricks automatically retains its existing identity, listener and origin handling and ignores `APP_HOST`/`APP_ORIGIN`; do not set `DATABRICKS_APP_*` variables on AWS to imitate that environment.

## Authentication and the remaining model dependency

An AWS deployment needs an **authenticated reverse proxy or identity adapter** that validates the viewer, strips client-supplied identity headers and sets `X-Forwarded-User` itself. Restrict container ingress to that trusted proxy. The app trusts that header; a client that can reach the container directly can spoof it. A plain ALB, including merely enabling ALB OIDC, does not implement this adapter or automatically map/validate its claims into these application headers. Authentication integration is a separate required deployment step.

Only Ask/Generate additionally requires `X-Forwarded-Access-Token`: it must be a valid per-user token for the existing Databricks workspace/model. AWS identity tokens are not Databricks tokens. The task also needs outbound access to that endpoint. Moving the model to another provider or implementing token exchange is outside this Docker change.

Set `APP_ORIGIN` to the externally visible HTTPS origin for browser model POSTs. The origin check does not infer trust from arbitrary forwarded headers. There are no credentials, user tokens or private exports in the image build context; the image does contain the private packaged data and should be stored in a private registry.

## AWS handoff

1. Create/use a **private ECR repository** and push the image built for the chosen CPU architecture. Example commands, to run later with your AWS account/region and repository permissions:

   ```sh
   export AWS_REGION="<aws-region>"
   export AWS_ACCOUNT_ID="<aws-account-id>"
   export CBA_ECR_REPOSITORY="cba-customer-insights"

   aws ecr get-login-password --region "$AWS_REGION" |
     docker login --username AWS --password-stdin \
       "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

   docker tag cba-insights:local \
     "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$CBA_ECR_REPOSITORY:demo"
   docker push \
     "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$CBA_ECR_REPOSITORY:demo"
   ```

   The repository must already exist. Use immutable release tags/digests for an actual rollout.

2. Configure an ECS/Fargate Linux task with matching `ARM64` or `X86_64` runtime architecture, container port 8080 and the authenticated proxy integration above. Start with one task; cache and request-rate limits are process-local. Allow enough memory for the 512 MB DuckDB limit plus Node and snapshot reconstruction; 1 vCPU / 2 GiB is a starting configuration to validate, not a load-tested capacity claim.

3. Supply `APP_ORIGIN`, leave `AUTH_MODE=user` and enable `linuxParameters.initProcessEnabled`. Restrict task ingress to the proxy/load balancer. No credentials are needed for the embedded data; grant model/network access separately if using AI actions.

4. Provide task-private writable storage for snapshot reconstruction. Local Docker uses the tmpfs command above. For ECS, configure a writable task volume or a supported platform-specific tmpfs at `/tmp` (or use `TMPDIR`); ensure UID 1000 can create its private directory. Plain ECS bind mounts can default to root-owned mode 0755. One concrete option is a task init container running as root that sets `chown 1000:1000 /tmp && chmod 0700 /tmp` on that app-only volume; start the app after the initializer succeeds. Another is to prepare a dedicated node-owned path and matching Dockerfile `VOLUME` as described in the AWS bind-mount documentation. Do not share that temporary directory between replicas. Only enable a read-only root filesystem once this mount is configured.

5. Copy the readiness command into the ECS container definition; ECS monitors task-defined health checks rather than relying on the Dockerfile declaration:

   ```json
   {
     "healthCheck": {
       "command": ["CMD", "node", "container/healthcheck.mjs"],
       "interval": 30,
       "timeout": 5,
       "retries": 3,
       "startPeriod": 30
     },
     "linuxParameters": {"initProcessEnabled": true}
   }
   ```

   An HTTP target-group readiness check can use `/api/ready`. `/api/health` is process liveness. Readiness validates the local snapshot and taxonomy, not the external model or the identity adapter. The app checks snapshot hashes before listening and refuses to start with missing/corrupt data or an unwritable temporary directory.

## Verification and platform limit

The Linux ARM64 image is built and smoke-tested, including full snapshot hashes/counts, authenticated data access, HTTPS-origin handling, read-only storage, Databricks regression behavior and actual loopback port publishing. See `qa/docker-smoke-arm64.json` and `qa/docker-context-results.json`. To repeat the image checks after building the local tag:

```sh
CBA_DOCKER_IMAGE=cba-insights:local CBA_DOCKER_ARCH=arm64 node qa/docker-smoke.mjs
```

The local Linux AMD64 cross-build under Colima/QEMU failed with `Illegal instruction` in the DuckDB native-driver check. This is not a successful x86 validation. Use the verified ARM64 image with an ARM64 AWS task, or build and test the AMD64 variant on a native x86 runner before selecting X86_64. Keep the build-time native-driver check enabled.

No ECS task, registry, IAM role, public endpoint or AWS deployment pipeline is created by this MR. See [ARCHITECTURE.md](../ARCHITECTURE.md) for the application design.

References: [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [AWS ECR push workflow](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html), [ECS health checks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html), [Fargate task parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html), [ECS bind mounts and ownership](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html).
