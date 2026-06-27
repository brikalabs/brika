/**
 * MigrationRunner tests — exercise the per-scope ledger, idempotency,
 * and the "stop on failure, continue next scope" contract.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VersionStateStore } from '@/runtime/updates/version-state';
import { MigrationRunner } from './runner';
import { type Migration, MigrationDeferred, type MigrationScope } from './types';

let brikaDir: string;

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-mig-'));
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

function makeMigration(id: string, runs: { count: number }, changed = true): Migration {
  return {
    id,
    description: `test ${id}`,
    async run() {
      runs.count += 1;
      return { changed };
    },
  };
}

function makeFailingMigration(id: string): Migration {
  return {
    id,
    description: `failing ${id}`,
    run() {
      return Promise.reject(new Error('boom'));
    },
  };
}

describe('MigrationRunner', () => {
  test('runs unapplied migrations in order and records them in the ledger', async () => {
    const runs = { count: 0 };
    const scope: MigrationScope = {
      name: 'test',
      migrations: [makeMigration('001', runs), makeMigration('002', runs)],
    };
    const versionState = new VersionStateStore(brikaDir, '0.6.0');
    const runner = new MigrationRunner([scope], {
      brikaDir,
      currentVersion: '0.6.0',
      versionState,
    });

    const reports = await runner.run();
    expect(reports[0]?.applied).toEqual(['001', '002']);
    expect(runs.count).toBe(2);
    expect(versionState.getAppliedMigrations('test')).toEqual(['001', '002']);
  });

  test('records a no-op migration as applied but never lists it as changed', async () => {
    const runs = { count: 0 };
    const scope: MigrationScope = {
      name: 'test',
      migrations: [makeMigration('001-real', runs, true), makeMigration('002-noop', runs, false)],
    };
    const versionState = new VersionStateStore(brikaDir, '0.6.0');
    const reports = await new MigrationRunner([scope], {
      brikaDir,
      currentVersion: '0.6.0',
      versionState,
    }).run();

    // Both ran and are recorded (so they are skipped forever after)…
    expect(reports[0]?.applied).toEqual(['001-real', '002-noop']);
    expect(versionState.getAppliedMigrations('test')).toEqual(['001-real', '002-noop']);
    // …but only the one that changed on-disk state is surfaced, so a pure no-op pass shows no banner.
    expect(reports[0]?.changed).toEqual(['001-real']);
  });

  test('skips already-applied migrations on re-run (idempotency)', async () => {
    const runs = { count: 0 };
    const scope: MigrationScope = {
      name: 'test',
      migrations: [makeMigration('001', runs)],
    };
    const versionState = new VersionStateStore(brikaDir, '0.6.0');

    await new MigrationRunner([scope], { brikaDir, currentVersion: '0.6.0', versionState }).run();
    await new MigrationRunner([scope], { brikaDir, currentVersion: '0.6.0', versionState }).run();

    expect(runs.count).toBe(1);
  });

  test('stops the failing scope after first error but continues subsequent scopes', async () => {
    const runs = { count: 0 };
    const scopeA: MigrationScope = {
      name: 'a',
      migrations: [makeFailingMigration('001'), makeMigration('002', runs)],
    };
    const scopeB: MigrationScope = {
      name: 'b',
      migrations: [makeMigration('001', runs)],
    };
    const versionState = new VersionStateStore(brikaDir, '0.6.0');
    const reports = await new MigrationRunner([scopeA, scopeB], {
      brikaDir,
      currentVersion: '0.6.0',
      versionState,
    }).run();

    expect(reports[0]?.failed).toHaveLength(1);
    expect(reports[0]?.applied).toEqual([]);
    expect(reports[1]?.applied).toEqual(['001']); // scope B still ran
    expect(runs.count).toBe(1); // only scope B's 001 ran
  });

  test('a failed migration stays unapplied so the next boot retries it', async () => {
    const versionState = new VersionStateStore(brikaDir, '0.6.0');
    const scope: MigrationScope = {
      name: 'test',
      migrations: [makeFailingMigration('001')],
    };

    await new MigrationRunner([scope], { brikaDir, currentVersion: '0.6.0', versionState }).run();
    expect(versionState.getAppliedMigrations('test')).toEqual([]);
  });

  test('deferred migrations are skipped without being recorded — retried on next run', async () => {
    let attempts = 0;
    const flaky: Migration = {
      id: '001-flaky',
      description: 'fails the first time, passes the second',
      run() {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new MigrationDeferred('not ready'));
        }
        return Promise.resolve({ changed: true });
      },
    };
    const scope: MigrationScope = { name: 'test', migrations: [flaky] };
    const versionState = new VersionStateStore(brikaDir, '0.6.0');

    const reports1 = await new MigrationRunner([scope], {
      brikaDir,
      currentVersion: '0.6.0',
      versionState,
    }).run();
    expect(reports1[0]?.applied).toEqual([]);
    expect(reports1[0]?.skipped).toEqual(['001-flaky']);
    expect(reports1[0]?.failed).toEqual([]);
    expect(versionState.getAppliedMigrations('test')).toEqual([]);

    const reports2 = await new MigrationRunner([scope], {
      brikaDir,
      currentVersion: '0.6.0',
      versionState,
    }).run();
    expect(reports2[0]?.applied).toEqual(['001-flaky']);
    expect(attempts).toBe(2);
  });

  test('report durations are non-negative integers', async () => {
    const runs = { count: 0 };
    const scope: MigrationScope = {
      name: 'test',
      migrations: [makeMigration('001', runs)],
    };
    const versionState = new VersionStateStore(brikaDir, '0.6.0');
    const reports = await new MigrationRunner([scope], {
      brikaDir,
      currentVersion: '0.6.0',
      versionState,
    }).run();
    expect(reports[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
