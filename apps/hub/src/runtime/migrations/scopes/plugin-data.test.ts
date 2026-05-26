/**
 * `plugin-data` scope tests — verify orphan UID dirs are pruned and
 * registered ones are kept.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MigrationDeferred } from '../types';
import { pluginDataScope } from './plugin-data';

let brikaDir: string;
let dataRoot: string;
let dbPath: string;

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-pd-'));
  dataRoot = join(brikaDir, 'plugins-data');
  dbPath = join(brikaDir, 'db', 'state.db');
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(join(brikaDir, 'db'), { recursive: true });
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

function seedDb(uids: string[]): void {
  const db = new Database(dbPath);
  db.exec('CREATE TABLE plugins (uid TEXT PRIMARY KEY)');
  for (const uid of uids) {
    db.query('INSERT INTO plugins (uid) VALUES (?)').run(uid);
  }
  db.close();
}

function seedDir(uid: string): void {
  mkdirSync(join(dataRoot, uid, 'data'), { recursive: true });
  writeFileSync(join(dataRoot, uid, 'data', 'x.txt'), 'x');
}

describe('plugin-data prune-orphans migration', () => {
  test('removes UID dirs whose UID is not in the plugins table', async () => {
    seedDb(['kept-1', 'kept-2']);
    seedDir('kept-1');
    seedDir('kept-2');
    seedDir('orphan-1');
    seedDir('orphan-2');

    await pluginDataScope.migrations[0]?.run({
      brikaDir,
      toVersion: '0.6.0',
      fromVersion: '0.5.0',
    });

    expect(existsSync(join(dataRoot, 'kept-1'))).toBe(true);
    expect(existsSync(join(dataRoot, 'kept-2'))).toBe(true);
    expect(existsSync(join(dataRoot, 'orphan-1'))).toBe(false);
    expect(existsSync(join(dataRoot, 'orphan-2'))).toBe(false);
  });

  test('is a no-op when plugins-data dir does not exist (fresh install)', async () => {
    rmSync(dataRoot, { recursive: true, force: true });
    seedDb(['anything']);

    await expect(
      pluginDataScope.migrations[0]?.run({
        brikaDir,
        toVersion: '0.6.0',
        fromVersion: null,
      })
    ).resolves.toBeUndefined();
  });

  test('defers (throws MigrationDeferred) when state.db is missing — never wipes a fresh install', async () => {
    seedDir('would-be-orphan');
    // No DB at all.

    await expect(
      pluginDataScope.migrations[0]?.run({
        brikaDir,
        toVersion: '0.6.0',
        fromVersion: null,
      })
    ).rejects.toBeInstanceOf(MigrationDeferred);

    // Defer == migration ran, but did nothing. Dir untouched.
    expect(existsSync(join(dataRoot, 'would-be-orphan'))).toBe(true);
  });

  test('defers when state.db exists but has no plugins table yet', async () => {
    const db = new Database(dbPath);
    db.exec('CREATE TABLE other (x INTEGER)');
    db.close();
    seedDir('would-be-orphan');

    await expect(
      pluginDataScope.migrations[0]?.run({
        brikaDir,
        toVersion: '0.6.0',
        fromVersion: null,
      })
    ).rejects.toBeInstanceOf(MigrationDeferred);
    expect(existsSync(join(dataRoot, 'would-be-orphan'))).toBe(true);
  });
});
