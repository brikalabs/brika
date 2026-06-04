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
#   cp apps/build/dist/full/brika "$ctx/"
#   cp -r apps/ui/dist "$ctx/ui"
#   cp Dockerfile "$ctx/"
#   docker build -t brika:dev "$ctx"

ARG BUN_VERSION=1.3.14

# Multi-arch source for the bun runtime (used to spawn plugin child
# processes). buildx picks the matching arch automatically.
FROM oven/bun:${BUN_VERSION}-slim AS bun-source

FROM debian:bookworm-slim
WORKDIR /app

# Create a non-root `brika` user (UID/GID 1000) and own /app + the
# secrets volume mount-point before dropping privileges. Running as root
# is the single biggest container-hardening lever — even a remote code
# execution bug in the hub is bounded to a low-privilege user and can't
# trivially escape to the host (no setuid, no /dev/raw, no capability
# set). Clears Snyk/Trivy's "image runs as root" finding (CIS Docker
# Benchmark 4.1).
RUN groupadd --system --gid 1000 brika \
 && useradd --system --uid 1000 --gid brika --home-dir /app --shell /sbin/nologin brika \
 && mkdir -p /app/.brika \
 && chown -R brika:brika /app

COPY --from=bun-source --chown=brika:brika /usr/local/bin/bun /usr/local/bin/bun
COPY --chown=brika:brika brika ./brika
COPY --chown=brika:brika ui    ./ui

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

USER brika

EXPOSE 3001
VOLUME ["/app/.brika"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /app/brika version || exit 1

CMD ["./brika", "hub"]
