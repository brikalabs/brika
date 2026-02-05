# syntax=docker/dockerfile:1

# === Build UI (platform-agnostic, runs on host) ===
FROM --platform=$BUILDPLATFORM oven/bun:1 AS build-ui
WORKDIR /app
COPY . .
RUN rm -rf node_modules && bun install --frozen-lockfile
RUN bun run --filter @brika/ui build

# === Build Hub (architecture-specific) ===
FROM oven/bun:1 AS build-hub
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN rm -rf node_modules && bun install --frozen-lockfile
RUN bun run --filter @brika/hub build

# === Runtime ===
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=build-hub /app/apps/hub/dist ./hub
COPY --from=build-hub /app/apps/hub/locales ./locales
COPY --from=build-ui /app/apps/ui/dist ./ui

ENV NODE_ENV=production \
    BRIKA_HOST=0.0.0.0 \
    BRIKA_PORT=3001 \
    BRIKA_STATIC_DIR=./ui

EXPOSE 3001
VOLUME ["/app/.brika"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --eval "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "hub/main.js"]
