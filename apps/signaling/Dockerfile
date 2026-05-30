# syntax=docker/dockerfile:1
#
# Brika standalone signaling coordinator — runs on Bun, ships the bootstrap
# SPA as static files from /app/dist/client.
#
# This image is unrelated to the top-level `Dockerfile`, which packages the
# `brika` CLI binary for hubs. This one is for operators self-hosting the
# signaling service instead of pointing their hub at hub.brika.dev.
#
# Build (from repo root):
#   docker build -f apps/signaling/Dockerfile -t brika-signaling:dev .

ARG BUN_VERSION=1.3.13

# ─── Stage 1: build the SPA + install prod deps ───────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS builder

WORKDIR /repo

# Copy the bun workspace files + the signaling app + its workspace deps.
# We deliberately copy the whole workspace skeleton so `bun install`
# resolves the workspace: protocol package correctly.
COPY package.json bun.lock ./
COPY packages packages/
COPY apps/signaling apps/signaling/

# `--ignore-scripts` blocks postinstall hooks from any dep — defence
# against a malicious package running arbitrary code at install time
# (Sonar's docker:S6505). The brika workspace doesn't rely on any
# postinstall side-effects, so the build is unaffected.
RUN bun install --frozen-lockfile --ignore-scripts

# Vite build emits the SPA bundle to apps/signaling/dist/client.
WORKDIR /repo/apps/signaling
RUN bun run build

# ─── Stage 2: runtime ─────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS runtime

WORKDIR /app

# Copy everything needed at runtime: server source, SPA bundle, migrations,
# and the resolved node_modules.
COPY --from=builder /repo/apps/signaling/server ./server
COPY --from=builder /repo/apps/signaling/migrations ./migrations
COPY --from=builder /repo/apps/signaling/dist/client ./dist/client
COPY --from=builder /repo/apps/signaling/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages

# Reasonable defaults — operators override via -e on `docker run` or in
# docker-compose.yml. TICKET_SECRET MUST be set; the entrypoint exits
# loudly if it's missing or too short.
ENV BRIKA_SIGNALING_PORT=8787 \
    BRIKA_SIGNALING_HOST=0.0.0.0 \
    BRIKA_SIGNALING_ASSETS_DIR=/app/dist/client \
    BRIKA_SIGNALING_SQLITE_PATH=/data/brika-signaling.db

# Run as a non-root user. The `oven/bun` image already ships a `bun` user
# (uid/gid 1000); we just need to chown the writable surfaces to it and
# drop privileges before CMD runs. Hardens against container-escape style
# CVEs and silences Sonar's docker:S6471 hotspot.
RUN mkdir -p /data && chown -R bun:bun /app /data
USER bun

VOLUME /data
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${BRIKA_SIGNALING_PORT}/v1/health" >/dev/null 2>&1 || exit 1

# Migrations + secret auto-gen happen on startup inside `standalone.ts`, so
# the CMD is just one process. No shell wrapper, no `&&` chain.
CMD ["bun", "run", "server/standalone.ts"]
