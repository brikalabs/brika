/**
 * Regression: independent `VersionStateStore` instances pointing at
 * the same `brikaDir` must not clobber each other's writes.
 *
 * The bug we're guarding against: the orchestrator constructs one
 * store, the migrations plugin constructs another, boot-rollback
 * constructs a third. Each loads from disk into its own `#state`,
 * then writes. Without read-before-write, instance A's write
 * persists state from *before* instance B's write, silently dropping
 * B's changes.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VersionStateStore } from './version-state';

let brikaDir: string;

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-vstate-coh-'));
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

describe('VersionStateStore concurrent-instance coherence', () => {
  test("a second instance picks up the first instance's writes via read-before-write", () => {
    // Boot N timeline simulation:
    const orchestratorStore = new VersionStateStore(brikaDir, '0.6.0');
    orchestratorStore.recordBootAttempt();

    // Migration plugin constructs its own store later — it reads
    // disk and sees the boot-attempt. Without coherence, it'd snap
    // back to an empty in-memory state.
    const migrationStore = new VersionStateStore(brikaDir, '0.6.0');
    migrationStore.recordMigrationApplied('plugin-data', '0001-prune-orphans');

    // Orchestrator finishes boot. THE BUG: if the orchestrator wrote
    // its stale snapshot here, `scopes` would be reset to `{}`. With
    // read-before-write, it picks up the migration ledger first.
    orchestratorStore.recordBootSuccess();

    // Final disk state — read with a fresh instance.
    const observer = new VersionStateStore(brikaDir, '0.6.0');
    expect(observer.snapshot.lastBootSucceededVersion).toBe('0.6.0');
    expect(observer.getAppliedMigrations('plugin-data')).toEqual(['0001-prune-orphans']);
  });

  test('three instances interleaving writes preserve every field', () => {
    const a = new VersionStateStore(brikaDir, '0.6.0');
    const b = new VersionStateStore(brikaDir, '0.6.0');
    const c = new VersionStateStore(brikaDir, '0.6.0');

    a.recordBootAttempt();
    b.recordMigrationApplied('secrets', '0001-stamp-v1');
    c.recordUpdate({
      from: '0.5.0',
      to: '0.6.0',
      at: new Date().toISOString(),
      status: 'ok',
    });
    a.recordBootSuccess();

    const observer = new VersionStateStore(brikaDir, '0.6.0');
    expect(observer.snapshot.lastBootSucceededVersion).toBe('0.6.0');
    expect(observer.getAppliedMigrations('secrets')).toEqual(['0001-stamp-v1']);
    expect(observer.snapshot.updateHistory.at(-1)?.to).toBe('0.6.0');
  });
});
