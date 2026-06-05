/**
 * `readUpdatePrefs` reads the channel + pin the hub persisted in
 * `state.db` without booting the hub. These tests cover both the
 * parsing/fallback logic (against hand-built fixtures) and real interop
 * with `StateStore` (so the on-disk encoding can't silently drift).
 */

import 'reflect-metadata';
import { Database } from 'bun:sqlite';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { container } from '@brika/di';
import { StateStore } from '../state/state-store';
import { readUpdatePrefs } from './update-prefs';

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-update-prefs-'));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Build a minimal `state.db` with the same shape the hub migration creates. */
function writeFixture(name: string, settings: Record<string, string>): string {
  const path = join(tmp, name);
  const db = new Database(path, { create: true });
  db.run('CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)');
  const insert = db.prepare<unknown, [string, string]>(
    'INSERT INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(settings)) {
    insert.run(key, value);
  }
  db.close();
  return path;
}

describe('readUpdatePrefs: fixtures', () => {
  test('reads channel + pinned version (values are JSON-encoded)', () => {
    const path = writeFixture('canary.db', {
      updateChannel: JSON.stringify('canary'),
      updatePinnedVersion: JSON.stringify('0.5.2'),
    });
    expect(readUpdatePrefs(path)).toEqual({ channel: 'canary', pinnedVersion: '0.5.2' });
  });

  test('defaults to stable / null when keys are absent', () => {
    const path = writeFixture('empty.db', {});
    expect(readUpdatePrefs(path)).toEqual({ channel: 'stable', pinnedVersion: null });
  });

  test('falls back to stable for an unknown channel id', () => {
    const path = writeFixture('bogus-channel.db', {
      updateChannel: JSON.stringify('experimental'),
    });
    expect(readUpdatePrefs(path).channel).toBe('stable');
  });

  test('falls back when a value is not valid JSON', () => {
    const path = writeFixture('corrupt.db', { updateChannel: 'not-json' });
    expect(readUpdatePrefs(path).channel).toBe('stable');
  });

  test('treats a non-string pinned version as null', () => {
    const path = writeFixture('bad-pin.db', { updatePinnedVersion: JSON.stringify(42) });
    expect(readUpdatePrefs(path).pinnedVersion).toBeNull();
  });

  test('returns defaults when the file does not exist', () => {
    expect(readUpdatePrefs(join(tmp, 'does-not-exist.db'))).toEqual({
      channel: 'stable',
      pinnedVersion: null,
    });
  });

  test('returns defaults when the settings table is missing', () => {
    const path = join(tmp, 'no-table.db');
    const db = new Database(path, { create: true });
    db.run('CREATE TABLE plugins (name TEXT)');
    db.close();
    expect(readUpdatePrefs(path)).toEqual({ channel: 'stable', pinnedVersion: null });
  });

  test('returns defaults when the file is not a valid database', () => {
    const path = join(tmp, 'garbage.db');
    writeFileSync(path, 'this is definitely not sqlite');
    expect(readUpdatePrefs(path)).toEqual({ channel: 'stable', pinnedVersion: null });
  });
});

describe('readUpdatePrefs: StateStore interop', () => {
  let statePath: string;
  let state: StateStore;

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'brika-update-prefs-interop-'));
    configureDatabases(dir);
    statePath = join(dir, 'db', 'state.db');
    state = container.resolve(StateStore);
    state.init();
  });

  afterEach(() => {
    state.setUpdateChannel('stable');
    state.setPinnedVersion(null);
  });

  // No checkpoint: the StateStore connection stays open (WAL mode), and
  // a read-only handle sees its committed, un-checkpointed frames. This
  // mirrors the live-hub case the feature targets, the hub holds the DB
  // open while the CLI reads.
  test('reads what a live StateStore wrote (un-checkpointed WAL)', () => {
    state.setUpdateChannel('canary');
    state.setPinnedVersion('0.5.2');
    expect(readUpdatePrefs(statePath)).toEqual({ channel: 'canary', pinnedVersion: '0.5.2' });
  });

  test('reflects the default stable channel with no pin', () => {
    expect(readUpdatePrefs(statePath)).toEqual({ channel: 'stable', pinnedVersion: null });
  });
});
