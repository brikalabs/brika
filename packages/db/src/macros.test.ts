import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMigrations } from './macros';

// loadMigrations resolves paths against the repo root, so fixtures must
// live inside the repo. Use a temp dir under packages/db.
const REPO_REL = 'packages/db/.cov-tmp';
const ABS = join(import.meta.dir, '..', '.cov-tmp');

afterAll(() => {
  rmSync(ABS, { recursive: true, force: true });
});

describe('loadMigrations', () => {
  test('returns tagged SqlMigration[] for an existing migrations folder', () => {
    const migrations = loadMigrations('packages/auth/src/migrations');
    expect(migrations.length).toBeGreaterThan(0);
    const first = migrations[0];
    expect(first?.kind).toBe('sql');
    expect(first?.tag).toBe('0000_init_auth');
    expect(first?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(first?.statements)).toBe(true);
    expect(first?.statements.length).toBeGreaterThan(0);
  });

  test('tags are in journal order and match the .sql filenames', () => {
    const migrations = loadMigrations('apps/hub/src/runtime/state/migrations');
    expect(migrations.map((m) => m.tag)).toEqual(['0000_init_state', '0001_custom_themes']);
  });

  test('splits a multi-statement migration on the breakpoint marker and hashes the file', () => {
    mkdirSync(join(ABS, 'multi', 'meta'), { recursive: true });
    writeFileSync(
      join(ABS, 'multi', 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ idx: 0, tag: '0000_two' }] })
    );
    writeFileSync(
      join(ABS, 'multi', '0000_two.sql'),
      'CREATE TABLE a (id);\n--> statement-breakpoint\nCREATE TABLE b (id);'
    );

    const [migration] = loadMigrations(`${REPO_REL}/multi`);
    expect(migration?.statements).toHaveLength(2);
    expect(migration?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('returns an empty list when the journal is structurally invalid', () => {
    mkdirSync(join(ABS, 'bad', 'meta'), { recursive: true });
    writeFileSync(join(ABS, 'bad', 'meta', '_journal.json'), JSON.stringify({ not: 'entries' }));
    expect(loadMigrations(`${REPO_REL}/bad`)).toEqual([]);
  });

  test('skips journal entries without a string tag', () => {
    mkdirSync(join(ABS, 'partial', 'meta'), { recursive: true });
    writeFileSync(
      join(ABS, 'partial', 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ idx: 0, tag: '0000_ok' }, { idx: 1 }, 'garbage'] })
    );
    writeFileSync(join(ABS, 'partial', '0000_ok.sql'), 'CREATE TABLE ok (id);');
    expect(loadMigrations(`${REPO_REL}/partial`).map((m) => m.tag)).toEqual(['0000_ok']);
  });
});
