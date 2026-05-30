/**
 * `applyPendingMigrations` coverage against `bun:sqlite` in `:memory:`.
 *
 * The CLI side of `migrations.ts` (env parsing + console output) is exercised
 * indirectly during standalone bootstrap; this test focuses on the reusable
 * factory the standalone calls.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPendingMigrations } from './migrations';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'brika-migrate-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('applyPendingMigrations (sqlite)', () => {
  it('applies every pending migration on a fresh DB', async () => {
    const result = await applyPendingMigrations({ sqlitePath: join(tmp, 'db.sqlite') });
    expect(result.applied).toEqual(['0001_init', '0002_hashed_tokens']);
    expect(result.skipped).toBe(0);
  });

  it('is idempotent — second run returns 0 applied, all skipped', async () => {
    const dbPath = join(tmp, 'db.sqlite');
    const first = await applyPendingMigrations({ sqlitePath: dbPath });
    const second = await applyPendingMigrations({ sqlitePath: dbPath });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toBe(first.applied.length);
  });

  it('creates the _brika_migrations tracker on first run', async () => {
    const dbPath = join(tmp, 'db.sqlite');
    await applyPendingMigrations({ sqlitePath: dbPath });
    const { Database } = await import('bun:sqlite');
    const db = new Database(dbPath);
    try {
      const rows = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_brika_migrations'")
        .all() as Array<{ name: string }>;
      expect(rows.length).toBe(1);
      const versions = db
        .prepare('SELECT version FROM _brika_migrations ORDER BY version')
        .all() as Array<{ version: string }>;
      expect(versions.map((r) => r.version)).toEqual(['0001_init', '0002_hashed_tokens']);
    } finally {
      db.close();
    }
  });

  it('creates the hashed-token claims table after migrations', async () => {
    const dbPath = join(tmp, 'db.sqlite');
    await applyPendingMigrations({ sqlitePath: dbPath });
    const { Database } = await import('bun:sqlite');
    const db = new Database(dbPath);
    try {
      const cols = db.prepare('PRAGMA table_info(claims)').all() as Array<{ name: string }>;
      const names = cols.map((c) => c.name);
      expect(names).toContain('name');
      expect(names).toContain('token_hash');
      expect(names).toContain('recovery_hash');
      expect(names).toContain('created_at');
      // The plaintext `token` column was dropped by 0002.
      expect(names).not.toContain('token');
    } finally {
      db.close();
    }
  });

  it('partial state: pre-marking 0001 as applied skips it on the next run', async () => {
    const dbPath = join(tmp, 'db.sqlite');
    // Pre-seed: create tracker + pretend 0001 already ran.
    const { Database } = await import('bun:sqlite');
    {
      const db = new Database(dbPath);
      db.exec(
        'CREATE TABLE _brika_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)'
      );
      db.exec(
        // 0001's original DDL — needed so 0002's DROP TABLE doesn't fail.
        'CREATE TABLE claims (name TEXT PRIMARY KEY, token TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE UNIQUE INDEX claims_token_idx ON claims (token)'
      );
      db.prepare('INSERT INTO _brika_migrations (version, applied_at) VALUES (?, ?)').run(
        '0001_init',
        Date.now()
      );
      db.close();
    }
    const result = await applyPendingMigrations({ sqlitePath: dbPath });
    expect(result.applied).toEqual(['0002_hashed_tokens']);
    expect(result.skipped).toBe(1);
  });
});
