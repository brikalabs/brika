#!/usr/bin/env bash
#
# Drop-in CI step: validate every locale's parity against the union of keys
# across all locales. Exits non-zero on errors. Pass `--ci` to also fail on
# warnings (missing-variable, etc).
#
# Usage:
#   bash examples/ci-check.sh                  # default: ./src/locales
#   LOCALES_DIR=./apps/web/src/locales bash examples/ci-check.sh
#   bash examples/ci-check.sh --ci             # strict mode
set -euo pipefail

LOCALES_DIR="${LOCALES_DIR:-./src/locales}"

bun x brika-i18n check \
  --locales "${LOCALES_DIR}" \
  --reference-locale en \
  "$@"
