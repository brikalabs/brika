# syntax=docker/dockerfile:1

# Bun version — keep in sync with engines.bun in package.json.
# Override at build time: docker build --build-arg BUN_VERSION=$(jq -r '.engines.bun' package.json)
ARG BUN_VERSION=1.3.9

# === Build UI (platform-agnostic, runs on host) ===
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION} AS build-ui
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --filter @brika/ui build

# === Build Hub (architecture-specific, compiled binary) ===
FROM oven/bun:${BUN_VERSION} AS build-hub
WORKDIR /app
# git is required to embed commit/branch/date in the build
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
COPY . .
RUN bun install --frozen-lockfile
WORKDIR /app/apps/hub
RUN bun run build --compile

# === Runtime (minimal — compiled binary includes Bun runtime) ===
FROM debian:bookworm-slim
WORKDIR /app

# Bun is needed for plugin execution (plugins are TypeScript child processes)
COPY --from=build-hub /usr/local/bin/bun /usr/local/bin/bun

COPY --from=build-hub /app/apps/hub/dist/brika ./brika
COPY --from=build-hub /app/apps/hub/src/locales  ./locales
COPY --from=build-ui  /app/apps/ui/dist         ./ui

ENV NODE_ENV=production \
    BRIKA_HOST=0.0.0.0 \
    BRIKA_PORT=3001 \
    BRIKA_STATIC_DIR=/app/ui \
    BRIKA_BUN_PATH=/usr/local/bin/bun

EXPOSE 3001
VOLUME ["/app/.brika"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /app/brika version || exit 1

CMD ["./brika", "start", "--foreground"]
