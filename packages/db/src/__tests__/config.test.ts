import { beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { __resetDatabaseConfig, configureDatabases, resolveDatabasePath } from '../config';

// `globalDir` is module-level state that persists across tests in a
// single worker — `__resetDatabaseConfig()` clears it so the
// unconfigured-throw path doesn't depend on test-file load order under
// `bun test` from the repo root.

describe('resolveDatabasePath — before configureDatabases is called', () => {
  beforeEach(() => {
    __resetDatabaseConfig();
  });

  test('throws for a relative path when globalDir is not set', () => {
    expect(() => resolveDatabasePath('relative.db')).toThrow(
      'call configureDatabases() before opening databases'
    );
  });
});

describe('resolveDatabasePath — special paths (no globalDir needed)', () => {
  test('returns ":memory:" unchanged', () => {
    expect(resolveDatabasePath(':memory:')).toBe(':memory:');
  });

  test('returns an absolute path unchanged', () => {
    expect(resolveDatabasePath('/absolute/path/db.sqlite')).toBe('/absolute/path/db.sqlite');
  });
});

describe('resolveDatabasePath — after configureDatabases', () => {
  test('returns join(globalDir, "db", filename) for a relative path', () => {
    configureDatabases('/tmp/test');
    expect(resolveDatabasePath('relative.db')).toBe(join('/tmp/test', 'db', 'relative.db'));
  });

  test('still returns ":memory:" unchanged after configureDatabases', () => {
    configureDatabases('/tmp/test');
    expect(resolveDatabasePath(':memory:')).toBe(':memory:');
  });

  test('still returns an absolute path unchanged after configureDatabases', () => {
    configureDatabases('/tmp/test');
    expect(resolveDatabasePath('/abs/path.db')).toBe('/abs/path.db');
  });
});
