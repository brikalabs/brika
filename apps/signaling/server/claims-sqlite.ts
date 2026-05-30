/**
 * SQLite-backed `ClaimStore` for the standalone signaling server.
 *
 * Picks the right driver per runtime via dynamic import:
 *   - Bun                     → `bun:sqlite`
 *   - Node ≥ 22.5 / Deno ≥ 2.2 → `node:sqlite` (still flagged until Node 24)
 *   - Fallback                → `better-sqlite3` (optional peer dep)
 *
 * Schema is shared with D1 — see `apps/signaling/migrations/sqlite/`. All
 * business logic (hashing, validation, the recovery flow) lives in
 * `createClaimStore`; this file is a thin {@link ClaimsExecutor} adapter.
 */

import {
  type ClaimRow,
  type ClaimStore,
  type ClaimsExecutor,
  createClaimStore,
} from '@brika/remote-access-protocol';

const COLS = 'name, token_hash, recovery_hash, created_at';

// Atomic first-come-first-serve insert (see `claims-d1.ts` for the rationale).
const INSERT_IF_ABSENT = `INSERT INTO claims (${COLS})
 VALUES (?, ?, ?, ?)
 ON CONFLICT (name) DO NOTHING
 RETURNING name`;

/**
 * Narrow shape every SQLite driver we support already satisfies (bun:sqlite,
 * node:sqlite, better-sqlite3). `get` is typed `unknown` because the three
 * drivers disagree on whether absent rows are `null` or `undefined`; the
 * executor body narrows via `as` + `!= null`.
 */
export interface SqliteDriver {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
  };
  close(): void;
}

type DriverCtor = new (path: string) => SqliteDriver;

async function loadDriver(path: string): Promise<SqliteDriver> {
  if ('Bun' in globalThis) {
    const mod = (await import('bun:sqlite')) as { Database: DriverCtor };
    return new mod.Database(path);
  }
  try {
    const mod = (await import('node:sqlite')) as { DatabaseSync: DriverCtor };
    return new mod.DatabaseSync(path);
  } catch {
    // Fall through to better-sqlite3.
  }
  try {
    // @ts-expect-error optional peer dep — only needed when node:sqlite is absent
    const mod = (await import('better-sqlite3')) as { default: DriverCtor };
    return new mod.default(path);
  } catch (err) {
    throw new Error(
      'No SQLite driver available. Install `better-sqlite3` (for Node <22.5) ' +
        'or upgrade to Bun, Node ≥22.5, or Deno ≥2.2.',
      { cause: err }
    );
  }
}

/**
 * Build the SQLite executor over an already-open driver. Exported so tests
 * can drive it directly with a pre-seeded in-memory `bun:sqlite` Database
 * without going through `openSqliteClaimStore` (which opens its own connection).
 */
export function createSqliteExecutor(driver: SqliteDriver): ClaimsExecutor {
  return {
    selectByName: (name) =>
      Promise.resolve(
        (driver
          .prepare(`SELECT ${COLS} FROM claims WHERE name = ?`)
          .get(name) as ClaimRow | null) ?? null
      ),
    selectByTokenHash: (hash) =>
      Promise.resolve(
        (driver
          .prepare(`SELECT ${COLS} FROM claims WHERE token_hash = ?`)
          .get(hash) as ClaimRow | null) ?? null
      ),
    count: () =>
      Promise.resolve(
        (driver.prepare('SELECT COUNT(*) AS n FROM claims').get() as { n: number } | null)?.n ?? 0
      ),
    insertIfAbsent: (row) =>
      Promise.resolve(
        driver
          .prepare(INSERT_IF_ABSENT)
          .get(row.name, row.token_hash, row.recovery_hash, row.created_at) != null
      ),
    updateTokenHash: (name, hash) => {
      driver.prepare('UPDATE claims SET token_hash = ? WHERE name = ?').run(hash, name);
      return Promise.resolve();
    },
    updateRecoveryHash: (name, hash) => {
      driver.prepare('UPDATE claims SET recovery_hash = ? WHERE name = ?').run(hash, name);
      return Promise.resolve();
    },
    updateTokenAndRecovery: (name, tokenHash, recoveryHash) => {
      driver
        .prepare('UPDATE claims SET token_hash = ?, recovery_hash = ? WHERE name = ?')
        .run(tokenHash, recoveryHash, name);
      return Promise.resolve();
    },
    deleteByName: (name) =>
      Promise.resolve(driver.prepare('DELETE FROM claims WHERE name = ?').run(name).changes > 0),
  };
}

/**
 * Open a SQLite-backed `ClaimStore`. Returns the store plus a `close()`
 * for graceful shutdown. Caller is responsible for running migrations
 * (`migrations.ts`) before claims are issued.
 */
export async function openSqliteClaimStore(
  path: string
): Promise<ClaimStore & { close: () => void }> {
  const driver = await loadDriver(path);
  return Object.assign(createClaimStore(createSqliteExecutor(driver)), {
    close: () => driver.close(),
  });
}
