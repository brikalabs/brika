# Testing in Brika

A short reference for what to write, where to put it, and which utilities to reach for. If anything here disagrees with the code, the code wins — fix the doc.

## Stack

- **Runner**: [`bun test`](https://bun.sh/docs/cli/test) (built-in). No Vitest, no Jest, no Mocha.
- **Assertions**: the `bun:test` API (`describe`, `it`/`test`, `expect`, `mock`).
- **Mocking**: `useBunMock()` from [`@brika/testing`](packages/testing) for Bun-native APIs (`Bun.file`, `Bun.spawn`, `Bun.serve`, `fetch`, `Bun.secrets`, …). Avoid hand-rolling spies — `useBunMock` handles auto-install and cleanup.

## File placement

- **Colocated only.** A test file lives next to the source it covers:
  ```
  src/
    workflow-executor.ts
    workflow-executor.test.ts
    workflow-executor.integration.test.ts
  ```
- `src/__tests__/` folders are not used for new code. Historical `__tests__/` folders are being migrated to colocated; do not add new files under them.
- Helper files local to a single package may stay colocated, prefixed with `_` (e.g. `_bun-secrets-mock.ts`). Anything reused by 2+ packages belongs in `@brika/testing`.

## Test types — name the file

We distinguish three kinds of tests by **file suffix** so a reader (or a future filter rule) can tell at a glance what a test costs:

| Suffix | Meaning |
|---|---|
| `*.test.ts` | **Unit.** Pure logic; no real filesystem, no real network, no subprocess, no DB. If it touches I/O, it does so through a mock (`useBunMock`, `mock.module`, etc.). |
| `*.integration.test.ts` | **Integration.** Hits real fs / SQLite / IPC channel / `Bun.spawn` / `Bun.serve`. Slower but exercises the real wiring. |
| `*.e2e.test.ts` | **End-to-end.** Boots the whole hub or drives the UI. Reserved — framework still to be picked. |

Heuristic for classifying: if the test imports `node:fs`, `node:fs/promises`, `node:child_process`, `bun:sqlite`, `Bun.spawn`, `Bun.serve`, `Bun.file` (without a `useBunMock` shim), or starts a real HTTP/IPC server, it's an integration test.

`bun test` picks up both `*.test.ts` and `*.integration.test.ts` — no CI plumbing changes needed.

## Shared utilities

[`@brika/testing`](packages/testing) is the source of truth for cross-package helpers:

- **`useBunMock()`** — auto-installs Bun API mocks for the lifetime of the `describe` block. Supports filesystem, fetch, spawn, secrets, etc.
- **`mockBun()` / `realFetch`** — lower-level building blocks if `useBunMock` isn't the right shape.
- **`flush(ms?)`** — yields the event loop ~25ms by default. Use when production code waits on a real timer (debounce, animation).
- **`waitFor(predicate, timeoutMs?)`** — polls every 10ms until the predicate returns true. Use it instead of fixed sleeps whenever the test asserts that *something happened*.
- **`proxify()`** — wraps an object so unstubbed methods throw early.

Local helpers (per-package) use the `_` prefix convention so they sort to the top of the directory and never get confused with production code (e.g. `_bun-secrets-mock.ts`). When a `_helper.ts` starts being copied into a second package, promote it to `@brika/testing` instead of duplicating.

## Coverage

- Configured in [`bunfig.toml`](bunfig.toml) at the repo root.
- The CI gate is **80% on each package's own `src/` files** (functions and lines).
- The gate is enforced by [`packages/workspace-tools/src/check-coverage.ts`](packages/workspace-tools/src/check-coverage.ts), not by Bun directly — Bun 1.3.14 reads `coverageThreshold` in `bunfig.toml` but does not yet act on it. The script does the per-package aggregation Bun's runner doesn't.
- Excluded paths (in both `bunfig.toml` `coverageSkipSourceFiles` and `packages/workspace-tools/src/check-coverage.ts` `DEFAULT_EXEMPT`):
  - `apps/ui`, `apps/docs`, `apps/schema-cdn` — pending a frontend test-framework decision.
  - `apps/build`, `apps/console` — thin orchestrators / CLI wrappers; coverage lives in the underlying packages.
  - `packages/tui` — Ink/React TUI primitives, no terminal-renderer harness in `bun:test` yet.

To run the gate locally:

```sh
bun packages/workspace-tools/src/check-coverage.ts                 # 80% on every src/ aggregate
bun packages/workspace-tools/src/check-coverage.ts --threshold=0.85
bun packages/workspace-tools/src/check-coverage.ts --skip=packages/foo
bun packages/workspace-tools/src/check-coverage.ts --no-default-skip   # also gate the exempt packages
```

To see raw per-file coverage for a single package:

```sh
cd packages/<name> && bun test --coverage
```

Some packages have no tests yet (`@brika/plugin`, `@brika/cli`, `@brika/components`). Smoke tests for those are tracked as follow-ups; they don't currently gate the run because they have no `src/` test coverage to drop.

## Frontend

`apps/ui` is excluded from the coverage gate today and has only a handful of tests. Picking a renderer-aware framework (Vitest browser mode, Playwright Component) is a separate decision tracked outside this guide.

## CI

The pre-push hook and CI both run:

```sh
bun run typecheck
bun test            # bun --filter '*' --parallel test --timeout=30000
bun run lint
```

Always run the trio locally before pushing. If a hook fails after a passing local run, investigate — don't bypass.

## Writing a new test

```ts
import { describe, expect, it } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { resolvePluginPath } from './paths';

describe('resolvePluginPath', () => {
  const bun = useBunMock();

  it('resolves an installed plugin', async () => {
    bun.fs({ '/plugins/foo/package.json': { name: 'foo' } }).apply();

    expect(await resolvePluginPath('foo')).toBe('/plugins/foo');
  });

  it('throws when the plugin is missing', () => {
    expect(() => resolvePluginPath('missing')).toThrow();
  });
});
```

For an integration test, drop the `useBunMock` and use real I/O:

```ts
// state-store.integration.test.ts
import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStateStore } from './state-store';

describe('StateStore (sqlite)', () => {
  it('persists writes across reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brika-test-'));
    try {
      const a = openStateStore(join(dir, 'state.db'));
      await a.set('k', 1);
      await a.close();

      const b = openStateStore(join(dir, 'state.db'));
      expect(await b.get('k')).toBe(1);
      await b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```
