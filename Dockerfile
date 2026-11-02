# syntax=docker/dockerfile:1.7
# Single image for MAXBALL EDTECH (#31): the Next.js frontend is prerendered
# to static assets and served by the same Node process as the /api/* backend.
# Data lives in PostgreSQL (MAXBALL_ADAPTER=postgres) or, without it, in the
# SQLite file and uploads under the /app/.local volume.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
# Toolchain only for the rare case better-sqlite3 has no prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=$APP_VERSION
WORKDIR /app
# Full production dependencies: TypeORM loads its database drivers
# dynamically, which standalone file tracing cannot follow.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts/migrate-sqlite-to-postgres.mjs ./scripts/
RUN mkdir -p /app/.local && chown node:node /app/.local
USER node
VOLUME ["/app/.local"]
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# APP_URL defaults to the platform URL on Render (RENDER_EXTERNAL_URL).
CMD ["sh", "-c", "export APP_URL=\"${APP_URL:-$RENDER_EXTERNAL_URL}\"; exec node server.js"]
