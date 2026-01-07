# ============================================================================
# BRIKA Docker Image - Optimized Multi-Stage Build
# ============================================================================
# Serves both the Bun hub API and built React UI from a single image.
# Mount your .brika config folder as a volume: -v $(pwd)/.brika:/app/.brika
# ============================================================================

# ----------------------------------------------------------------------------
# Stage 1: Base - Bun runtime with git
# ----------------------------------------------------------------------------
FROM oven/bun:1 AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------------------------------------------------------
# Stage 2: Dependencies - Install all workspace dependencies
# ----------------------------------------------------------------------------
FROM base AS deps

COPY package.json bun.lock ./
COPY apps/hub/package.json ./apps/hub/
COPY apps/ui/package.json ./apps/ui/
COPY packages/banner/package.json ./packages/banner/
COPY packages/events/package.json ./packages/events/
COPY packages/flow/package.json ./packages/flow/
COPY packages/ipc/package.json ./packages/ipc/
COPY packages/router/package.json ./packages/router/
COPY packages/schema/package.json ./packages/schema/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/serializable/package.json ./packages/serializable/
COPY packages/shared/package.json ./packages/shared/
COPY packages/workflow/package.json ./packages/workflow/
COPY plugins/blocks-builtin/package.json ./plugins/blocks-builtin/
COPY plugins/demo-config/package.json ./plugins/demo-config/
COPY plugins/example-echo/package.json ./plugins/example-echo/
COPY plugins/timer/package.json ./plugins/timer/

RUN bun install

# ----------------------------------------------------------------------------
# Stage 3a: Build UI (runs in parallel with build-hub)
# ----------------------------------------------------------------------------
FROM deps AS build-ui

COPY . .
RUN bun run --filter @brika/ui build

# ----------------------------------------------------------------------------
# Stage 3b: Build Hub (runs in parallel with build-ui)
# ----------------------------------------------------------------------------
FROM deps AS build-hub

COPY . .
RUN bun run --filter @brika/hub build

# ----------------------------------------------------------------------------
# Stage 4: Runtime - Minimal production image
# ----------------------------------------------------------------------------
FROM oven/bun:1-slim AS runtime

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 brika \
    && useradd --uid 1001 --gid 1001 -m brika \
    && mkdir -p /app/.brika \
    && chown -R brika:brika /app

# Copy built UI assets (from build-ui stage)
COPY --from=build-ui --chown=brika:brika /app/apps/ui/dist ./public

# Copy hub locales
COPY --from=build-hub --chown=brika:brika /app/apps/hub/locales ./locales

# Copy hub source and dependencies (from build-hub stage)
COPY --from=build-hub --chown=brika:brika /app/apps/hub ./apps/hub
COPY --from=build-hub --chown=brika:brika /app/packages ./packages
COPY --from=build-hub --chown=brika:brika /app/plugins ./plugins
COPY --from=build-hub --chown=brika:brika /app/node_modules ./node_modules
COPY --from=build-hub --chown=brika:brika /app/package.json ./
COPY --from=build-hub --chown=brika:brika /app/tsconfig.json ./
COPY --from=build-hub --chown=brika:brika /app/tsconfig.base.json ./

# Pre-install default plugins from npm
RUN mkdir -p /app/.brika/plugins \
    && cd /app/.brika/plugins \
    && echo '{"dependencies":{}}' > package.json \
    && bun add @brika/blocks-builtin \
    && chown -R brika:brika /app/.brika

USER brika

ENV NODE_ENV=production
ENV BRIKA_HOST=0.0.0.0
ENV BRIKA_PORT=3001
ENV BRIKA_STATIC_DIR=./public

EXPOSE 3001
VOLUME ["/app/.brika"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD bun --eval "fetch('http://localhost:3001/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "apps/hub/src/main.ts"]
