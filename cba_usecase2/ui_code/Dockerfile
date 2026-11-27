# Official glibc-based Node image; DuckDB's native binding is installed for the target CPU.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:66cb8ef75184df13dc0dcf866330488996b485d404db60555756865300ced4a5
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# Fail the build if the target-platform DuckDB binding cannot load.
RUN node --input-type=module -e "import {DuckDBInstance} from '@duckdb/node-api'; const db=await DuckDBInstance.create(':memory:'); const c=await db.connect(); const r=await c.runAndReadAll('SELECT 1'); r.closeSync(); c.closeSync(); db.closeSync();"

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    APP_HOST=0.0.0.0 \
    AUTH_MODE=user
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json server.mjs ./
COPY server/ ./server/
COPY public/ ./public/
COPY config/taxonomy.json config/taxonomy-source.yaml ./config/
COPY data/snapshot-manifest.json data/snapshot-*.bin ./data/
COPY container/healthcheck.mjs ./container/healthcheck.mjs
RUN chmod -R a=rX /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "container/healthcheck.mjs"]
CMD ["node", "server.mjs"]
