/**
 * Boot-rollback failure-mode regression: when a rename throws, the
 * audit log must record WHICH stage failed (`live-to-broken` vs
 * `previous-to-live`) so a post-mortem can tell whether the system
 * was left bootable.
 *
 * The "live ENOENT before any rename" path is reachable
 * deterministically (just don't write the live binary). The
 * "second rename fails after the first succeeded" path is harder to
 * trigger without monkey-patching; the inverse-rename safety net for
 * that case is verified by code inspection — this test pins the
 * audit-log shape so a refactor can't silently drop the `stage` key.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAndRollback } from './boot-rollback';
import { previousBinaryPath } from './staged-install';
import { VersionStateStore } from './version-state';

let installDir: string;
let brikaDir: string;

beforeEach(() => {
  installDir = mkdtempSync(join(tmpdir(), 'brika-rb-fail-install-'));
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-rb-fail-data-'));
});

afterEach(() => {
  rmSync(installDir, { recursive: true, force: true });
  rmSync(brikaDir, { recursive: true, force: true });
});

const noopExit: (code: number) => never = (() => undefined) as never;

function readAudit(brikaDir: string): Array<{ kind: string; data: Record<string, unknown> }> {
  const path = join(brikaDir, 'updates.log');
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe('boot-rollback rename failure audit', () => {
  test("records `stage: 'live-to-broken'` when the first rename fails (no live binary)", () => {
    // Only `.previous` exists — `renameSync(live, broken)` will ENOENT.
    writeFileSync(previousBinaryPath(installDir), 'known-good');
    const vs = new VersionStateStore(brikaDir, '0.6.0');
    vs.recordBootAttempt();

    const outcome = checkAndRollback({ brikaDir, installDir, exit: noopExit });
    expect(outcome).toBe('no-backup');

    const failures = readAudit(brikaDir).filter((e) => e.kind === 'apply.failure');
    expect(failures.length).toBeGreaterThan(0);
    const last = failures.at(-1);
    expect(last?.data.reason).toBe('rollback-failed');
    expect(last?.data.stage).toBe('live-to-broken');
  });
});
