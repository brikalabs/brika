/**
 * SQLite executor coverage against `bun:sqlite` in `:memory:`.
 *
 * Drives `createSqliteExecutor` directly with a pre-seeded in-memory Database
 * so we verify the SQL the production path actually runs (in particular the
 * atomic `INSERT … ON CONFLICT DO NOTHING` first-come-first-serve guard)
 * without going through the runtime-detection loader.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type ClaimStore, createClaimStore } from '@brika/remote-access-protocol';
import { createSqliteExecutor } from './claims-sqlite';

const SCHEMA = `
CREATE TABLE claims (
  name           TEXT PRIMARY KEY,
  token_hash     TEXT NOT NULL,
  recovery_hash  TEXT,
  created_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX claims_token_hash_idx ON claims (token_hash);
`;

describe('SQLite ClaimStore (bun:sqlite, in-memory)', () => {
  let store: ClaimStore;
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA);
    store = createClaimStore(createSqliteExecutor(db));
  });

  afterEach(() => {
    db.close();
  });

  it('claim returns plaintext token + recoveryCode, both ≥ 20 chars', async () => {
    const minted = await store.claim('myhub');
    expect(minted.name).toBe('myhub');
    expect(minted.token.length).toBeGreaterThan(20);
    expect(minted.recoveryCode?.length).toBeGreaterThan(20);
  });

  it('reclaim of same name → ClaimError(taken)', async () => {
    await store.claim('myhub');
    expect(store.claim('myhub')).rejects.toMatchObject({ code: 'taken' });
  });

  it('claim of invalid name → ClaimError(invalid-name)', async () => {
    expect(store.claim('a')).rejects.toMatchObject({ code: 'invalid-name' });
  });

  it('findByToken hashes the input and returns the stored Claim', async () => {
    const minted = await store.claim('myhub');
    const found = await store.findByToken(minted.token);
    expect(found).toEqual({ name: 'myhub', createdAt: minted.createdAt });
  });

  it('findByToken with unknown token → null', async () => {
    expect(await store.findByToken('nope')).toBeNull();
  });

  it('token is stored hashed, never as plaintext', async () => {
    const minted = await store.claim('myhub');
    const row = db.prepare('SELECT token_hash FROM claims WHERE name = ?').get('myhub') as {
      token_hash: string;
    };
    expect(row.token_hash).not.toBe(minted.token);
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rotateToken mints new token, preserves createdAt, invalidates old', async () => {
    const original = await store.claim('myhub');
    const rotated = await store.rotateToken('myhub');
    expect(rotated.token).not.toBe(original.token);
    expect(rotated.createdAt).toBe(original.createdAt);
    expect(await store.findByToken(original.token)).toBeNull();
    expect(await store.findByToken(rotated.token)).not.toBeNull();
  });

  it('recover with correct code mints new token + new recovery; old code invalidated', async () => {
    const original = await store.claim('myhub');
    if (!original.recoveryCode) {
      throw new Error('expected recoveryCode');
    }
    const recovered = await store.recover('myhub', original.recoveryCode);
    expect(recovered.token).not.toBe(original.token);
    expect(recovered.recoveryCode).not.toBe(original.recoveryCode);
    expect(store.recover('myhub', original.recoveryCode)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('recover with wrong code → ClaimError(unauthorized)', async () => {
    await store.claim('myhub');
    expect(store.recover('myhub', 'wrong')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('mintRecoveryCode rotates the recovery code; old becomes invalid', async () => {
    const original = await store.claim('myhub');
    const next = await store.mintRecoveryCode('myhub');
    expect(next).not.toBe(original.recoveryCode);
    expect(await store.recover('myhub', next)).toBeDefined();
    if (!original.recoveryCode) {
      throw new Error('expected original recoveryCode');
    }
    expect(store.recover('myhub', original.recoveryCode)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('release returns true on removal, false on unknown', async () => {
    const minted = await store.claim('myhub');
    expect(await store.release('myhub')).toBe(true);
    expect(await store.findByToken(minted.token)).toBeNull();
    expect(await store.release('myhub')).toBe(false);
  });

  it('size reflects current row count', async () => {
    expect(await store.size()).toBe(0);
    await store.claim('myhub');
    await store.claim('other');
    expect(await store.size()).toBe(2);
  });
});
