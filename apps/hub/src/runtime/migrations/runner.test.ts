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
import type { Migration, MigrationScope } from './types';

let brikaDir: string;

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-mig-'));
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

function makeMigration(id: string, runs: { count: number }): Migration {
  return {
    id,
    description: `test ${id}`,
    async run() {
      runs.count += 1;
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
