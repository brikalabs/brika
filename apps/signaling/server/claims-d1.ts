/**
 * D1-backed `ClaimStore`.
 *
 * Implements the {@link ClaimsExecutor} primitives; `createClaimStore` (in
 * `@brika/remote-access-protocol`) wraps them with the shared business logic
 * (hashing, validation, the recovery flow).
 */

import {
  type ClaimRow,
  type ClaimStore,
  type ClaimsExecutor,
  createClaimStore,
} from '@brika/remote-access-protocol';

const COLS = 'name, token_hash, recovery_hash, created_at';

// Atomic first-come-first-serve insert. `ON CONFLICT DO NOTHING` + `RETURNING`
// means a concurrent claim of the same name sees a null result and loses the
// race — no read-then-write window.
const INSERT_IF_ABSENT = `INSERT INTO claims (${COLS})
 VALUES (?, ?, ?, ?)
 ON CONFLICT (name) DO NOTHING
 RETURNING name`;

export function createD1ClaimStore(db: D1Database): ClaimStore {
  const executor: ClaimsExecutor = {
    selectByName: async (name) =>
      (await db
        .prepare(`SELECT ${COLS} FROM claims WHERE name = ?`)
        .bind(name)
        .first<ClaimRow>()) ?? null,
    selectByTokenHash: async (hash) =>
      (await db
        .prepare(`SELECT ${COLS} FROM claims WHERE token_hash = ?`)
        .bind(hash)
        .first<ClaimRow>()) ?? null,
    count: async () =>
      (await db.prepare('SELECT COUNT(*) AS n FROM claims').first<{ n: number }>())?.n ?? 0,
    insertIfAbsent: async (row) => {
      const result = await db
        .prepare(INSERT_IF_ABSENT)
        .bind(row.name, row.token_hash, row.recovery_hash, row.created_at)
        .first<{ name: string }>();
      return result !== null;
    },
    updateTokenHash: async (name, hash) => {
      await db.prepare('UPDATE claims SET token_hash = ? WHERE name = ?').bind(hash, name).run();
    },
    updateRecoveryHash: async (name, hash) => {
      await db.prepare('UPDATE claims SET recovery_hash = ? WHERE name = ?').bind(hash, name).run();
    },
    updateTokenAndRecovery: async (name, tokenHash, recoveryHash) => {
      await db
        .prepare('UPDATE claims SET token_hash = ?, recovery_hash = ? WHERE name = ?')
        .bind(tokenHash, recoveryHash, name)
        .run();
    },
    deleteByName: async (name) => {
      const result = await db.prepare('DELETE FROM claims WHERE name = ?').bind(name).run();
      return (result.meta?.changes ?? 0) > 0;
    },
  };
  return createClaimStore(executor);
}
