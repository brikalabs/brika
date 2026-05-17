# syntax=docker/dockerfile:1
#
# Production image — minimal runtime that bundles a prebuilt `brika`
# binary + the UI dist. The compile happens *outside* docker (see the
# `binaries` matrix in .github/workflows/build.yml) so the image build
# is just a few file copies, fast on any architecture.
#
# Expected build context layout:
#   ./brika   — compiled `brika` binary for the target arch
#   ./ui/     — apps/ui/dist contents (embedded UI bundle)
#
# Local build:
#   bun run compile
#   ctx=$(mktemp -d)
#   cp apps/console/dist/brika "$ctx/"
#   cp -r apps/ui/dist "$ctx/ui"
#   cp Dockerfile "$ctx/"
#   docker build -t brika:dev "$ctx"

ARG BUN_VERSION=1.3.13

# Multi-arch source for the bun runtime (used to spawn plugin child
# processes). buildx picks the matching arch automatically.
FROM oven/bun:${BUN_VERSION}-slim AS bun-source

FROM debian:bookworm-slim
WORKDIR /app

COPY --from=bun-source /usr/local/bin/bun /usr/local/bin/bun
COPY brika ./brika
COPY ui    ./ui

ENV NODE_ENV=production \
    BRIKA_HOST=0.0.0.0 \
    BRIKA_PORT=3001 \
    BRIKA_BUN_PATH=/usr/local/bin/bun \
    # Headless containers have no Secret Service (libsecret + D-Bus).
    # Default to the AES-256-GCM file backend under /app/.brika.
    # Mount BRIKA_SECRET_KEY (base64 of 32 random bytes) via Docker/K8s
    # secrets in production so the master key isn't co-located with
    # the ciphertext.
    BRIKA_SECRETS_BACKEND=file

EXPOSE 3001
VOLUME ["/app/.brika"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /app/brika version || exit 1

CMD ["./brika", "hub"]
