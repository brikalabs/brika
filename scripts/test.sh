#!/usr/bin/env bash
# Run all tests in two phases to work around Bun bug #12823
# (mock.module() bleeds process-wide, so CLI tests with mock.module
# must run in separate processes).
#
# Usage:
#   scripts/test.sh              # Run tests only (fails on error)
#   scripts/test.sh --coverage   # Run tests + generate merged LCOV (continues on failure)
set -uo pipefail

COVERAGE=false
COVERAGE_ARGS=""
EXIT_CODE=0
if [[ "${1:-}" == "--coverage" ]]; then
  COVERAGE=true
  COVERAGE_ARGS="--coverage --coverage-reporter=lcov --coverage-reporter=text"
  rm -rf coverage
  mkdir -p coverage
else
  # In non-coverage mode, exit immediately on failure
  set -e
fi

# Isolated test files that use mock.module for shared packages
ISOLATED=(
  apps/hub/src/__tests__/cli-auth-prompts.test.ts
  apps/hub/src/__tests__/cli-auth-token.test.ts
  apps/hub/src/__tests__/cli-auth-users.test.ts
)

# Phase 1: Run all tests except the isolated CLI auth tests.
# Pass non-cli-auth hub tests explicitly + packages/ directory for auto-discovery.
echo "Phase 1: Main test suite (excluding isolated CLI tests)..."
hub_tests=$(ls apps/hub/src/__tests__/*.test.ts | grep -v 'cli-auth-')
# shellcheck disable=SC2086
bun test $hub_tests packages/ plugins/ $COVERAGE_ARGS || EXIT_CODE=$?

if [[ "$COVERAGE" == true ]]; then
  mv coverage/lcov.info coverage/phase1.lcov 2>/dev/null || true
fi

echo ""
echo "Phase 2: Isolated CLI tests (separate processes)..."
phase=2
for f in "${ISOLATED[@]}"; do
  echo "  → $f"
  # shellcheck disable=SC2086
  bun test "$f" $COVERAGE_ARGS || EXIT_CODE=$?
  if [[ "$COVERAGE" == true ]]; then
    mv coverage/lcov.info "coverage/phase${phase}.lcov" 2>/dev/null || true
    ((phase++))
  fi
done

# Merge all LCOV files into one
if [[ "$COVERAGE" == true ]]; then
  echo ""
  echo "Merging coverage reports..."
  bun scripts/merge-lcov.ts coverage/phase*.lcov > coverage/lcov.info
  rm -f coverage/phase*.lcov
  echo "Coverage report: coverage/lcov.info ($(grep -c '^SF:' coverage/lcov.info) unique files)"

  if [[ "$EXIT_CODE" -ne 0 ]]; then
    echo ""
    echo "Warning: some tests failed (exit code $EXIT_CODE), but coverage was collected."
  fi
fi

if [[ "$COVERAGE" == false ]]; then
  echo ""
  echo "All tests passed!"
fi

exit "$EXIT_CODE"
