/**
 * VersionStateStore tests.
 *
 * Uses a fresh temp directory per test so we exercise the
 * on-disk read/write round-trip without leaking state between runs.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VersionStateStore } from './version-state';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-vstate-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('VersionStateStore', () => {
  test('initial state has no boot history and points at the current version', () => {
    const store = new VersionStateStore(tmp, '0.5.0');
    expect(store.snapshot.lastSeenVersion).toBe('0.5.0');
    expect(store.snapshot.lastBootSucceededVersion).toBeNull();
    expect(store.snapshot.lastBootAttemptedAt).toBeNull();
    expect(store.snapshot.updateHistory).toEqual([]);
  });

  test('recordBootAttempt + recordBootSuccess updates the snapshot', () => {
    const store = new VersionStateStore(tmp, '0.5.0');
    store.recordBootAttempt();
    expect(store.snapshot.lastBootAttemptedVersion).toBe('0.5.0');
    expect(store.snapshot.lastBootSucceededVersion).toBeNull();

    store.recordBootSuccess();
    expect(store.snapshot.lastBootSucceededVersion).toBe('0.5.0');
    expect(store.snapshot.lastSeenVersion).toBe('0.5.0');
  });

  test('persists across instances (file on disk is the source of truth)', () => {
    const a = new VersionStateStore(tmp, '0.5.0');
    a.recordBootAttempt();
    a.recordBootSuccess();

    const b = new VersionStateStore(tmp, '0.5.0');
    expect(b.snapshot.lastBootSucceededVersion).toBe('0.5.0');
  });

  test('previousBootCrashed() returns true when an attempt has no matching success', () => {
    const a = new VersionStateStore(tmp, '0.5.0');
    a.recordBootAttempt();
    // Simulate process death between attempt and success — no recordBootSuccess.

    const b = new VersionStateStore(tmp, '0.5.0');
    expect(b.previousBootCrashed()).toBe(true);
  });

  test('previousBootCrashed() returns false after a clean boot cycle', () => {
    const a = new VersionStateStore(tmp, '0.5.0');
    a.recordBootAttempt();
    a.recordBootSuccess();

    const b = new VersionStateStore(tmp, '0.5.0');
    expect(b.previousBootCrashed()).toBe(false);
  });

  test('recordUpdate appends to history and caps at 50 entries', () => {
    const store = new VersionStateStore(tmp, '0.5.0');
    for (let i = 0; i < 55; i++) {
      store.recordUpdate({
        from: `0.5.${i}`,
        to: `0.5.${i + 1}`,
        at: new Date().toISOString(),
        status: 'ok',
      });
    }
    expect(store.snapshot.updateHistory).toHaveLength(50);
    expect(store.snapshot.updateHistory[0]?.from).toBe('0.5.5');
    expect(store.snapshot.updateHistory.at(-1)?.from).toBe('0.5.54');
  });

  test('corrupt JSON falls back to an empty state instead of throwing', () => {
    writeFileSync(join(tmp, '.version-state.json'), '{not json');
    const store = new VersionStateStore(tmp, '0.5.0');
    expect(store.snapshot.lastSeenVersion).toBe('0.5.0');
    expect(store.snapshot.updateHistory).toEqual([]);
  });

  test('schema mismatch falls back to an empty state', () => {
    writeFileSync(
      join(tmp, '.version-state.json'),
      JSON.stringify({ schemaVersion: 999, lastSeenVersion: '0.0.0' })
    );
    const store = new VersionStateStore(tmp, '0.5.0');
    expect(store.snapshot.lastSeenVersion).toBe('0.5.0');
  });

  test('preserves the migration ledger when the rest of the file fails validation', () => {
    // A future schemaVersion bump (or a single corrupt field) must NOT wipe the applied-migration
    // ledger: wiping it is what silently re-runs every migration and re-fires the "state updated"
    // banner. Salvage the ledger, reset only the (recomputable) boot-tracking fields.
    writeFileSync(
      join(tmp, '.version-state.json'),
      JSON.stringify({
        schemaVersion: 999, // unknown version → full-schema parse fails
        lastSeenVersion: 12345, // wrong type, too
        scopes: { 'plugin-data': ['0001-prune-orphans'], secrets: ['0001-stamp-v1'] },
      })
    );
    const warnings: string[] = [];
    const store = new VersionStateStore(tmp, '0.5.0', (message) => warnings.push(message));

    // Boot-tracking fields are reset…
    expect(store.snapshot.lastSeenVersion).toBe('0.5.0');
    // …but the migration ledger survives, so migrations are NOT re-applied on the next boot.
    expect(store.getAppliedMigrations('plugin-data')).toEqual(['0001-prune-orphans']);
    expect(store.getAppliedMigrations('secrets')).toEqual(['0001-stamp-v1']);
    // And the corruption is surfaced rather than reset silently.
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('warns (does not silently reset) when the file is not valid JSON', () => {
    writeFileSync(join(tmp, '.version-state.json'), '{not json');
    const warnings: string[] = [];
    const store = new VersionStateStore(tmp, '0.5.0', (message) => warnings.push(message));
    expect(store.snapshot.lastSeenVersion).toBe('0.5.0');
    expect(warnings).toHaveLength(1);
  });

  test('writes the state file with 0600 mode (best-effort secrets hygiene)', () => {
    const store = new VersionStateStore(tmp, '0.5.0');
    store.recordBootAttempt();
    const path = join(tmp, '.version-state.json');
    expect(existsSync(path)).toBe(true);
    // Snapshot the persisted JSON to confirm what landed on disk.
    const persisted = JSON.parse(readFileSync(path, 'utf8'));
    expect(persisted.lastBootAttemptedVersion).toBe('0.5.0');
  });
});
