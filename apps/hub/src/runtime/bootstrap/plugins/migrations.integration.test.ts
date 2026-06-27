/**
 * Bootstrap plugin integration — exercise the full lifecycle of the
 * `migrations()` plugin: construct the runner, run the scopes against
 * a tmp `brikaDir`, expose the report via `MigrationStatus`.
 *
 * Covers the plugin body that wraps `MigrationRunner` — the scopes
 * themselves have their own unit tests.
 */

import 'reflect-metadata';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { container } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { MigrationStatus, migrations } from './migrations';

describe('migrations() bootstrap plugin', () => {
  beforeAll(() => {
    // brikaContext freezes its paths at module load — point them at
    // a tmp dir for the duration of these tests by reusing the dir
    // that brikaContext already settled on.
    expect(brikaContext.brikaDir.length).toBeGreaterThan(0);
  });

  beforeEach(() => {
    // Don't reset the container — the plugin and the test both
    // resolve MigrationStatus, and a reset between those resolutions
    // can break singleton identity in tsyringe.
  });

  afterEach(() => {
    // Clean any audit log + version-state files left behind so the
    // next test starts from a clean slate.
    const log = join(brikaContext.systemDir, 'updates.log');
    const vs = join(brikaContext.systemDir, '.version-state.json');
    rmSync(log, { force: true });
    rmSync(vs, { force: true });
  });

  test('plugin name is "migrations" — the bootstrap chain greps for it', () => {
    const p = migrations();
    expect(p.name).toBe('migrations');
  });

  test('onInit runs all scopes and populates MigrationStatus', async () => {
    const p = migrations();
    await p.onInit?.();

    const status = container.resolve(MigrationStatus);
    const snapshot = status.snapshot;
    expect(snapshot.completedAt).toBeGreaterThan(0);
    expect(snapshot.reports.length).toBeGreaterThan(0);
    // Every shipped scope should appear in the report.
    const scopeNames = snapshot.reports.map((r) => r.scope);
    expect(scopeNames).toContain('plugin-data');
    expect(scopeNames).toContain('secrets');
  });

  test('MigrationStatus singleton replays the last report shape', async () => {
    await migrations().onInit?.();
    const status = container.resolve(MigrationStatus);
    const snap = status.snapshot;
    for (const r of snap.reports) {
      expect(r).toHaveProperty('scope');
      expect(r).toHaveProperty('applied');
      expect(r).toHaveProperty('skipped');
      expect(r).toHaveProperty('failed');
      expect(r).toHaveProperty('durationMs');
    }
  });

  test('audit log entry is written after migration completion', async () => {
    const logPath = join(brikaContext.systemDir, 'updates.log');
    // Force-delete any existing log so we measure exactly what THIS run produces.
    rmSync(logPath, { force: true });
    await migrations().onInit?.();
    // The runner only audits when applied.length > 0; the secrets
    // scope always applies its stamp on a fresh install, so the
    // audit log should exist.
    expect(existsSync(logPath)).toBe(true);
  });
});
