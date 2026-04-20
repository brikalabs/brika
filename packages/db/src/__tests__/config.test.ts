import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { configureDatabases, resolveDatabasePath } from '../config';

// NOTE: `globalDir` is module-level state that persists across tests in a
// single worker. The throw-when-unconfigured case MUST run before any call to
// `configureDatabases()`, so it is placed in its own describe block at the top.

describe('resolveDatabasePath — before configureDatabases is called', () => {
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
