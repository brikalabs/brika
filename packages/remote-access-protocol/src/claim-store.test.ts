import { describe, expect, it } from 'bun:test';
import { type ClaimRow, type ClaimsExecutor, createClaimStore, ctEqHex } from './claim-store';
import { ClaimError, hashToken } from './claims-validation';
import { createInMemoryClaimStore } from './testing';

/** Build a minimal ClaimsExecutor backed by a pre-seeded row map. */
function makeExecutorWithRow(row: ClaimRow): ClaimsExecutor {
  const byName = new Map<string, ClaimRow>([[row.name, row]]);
  return {
    selectByName: (n) => Promise.resolve(byName.get(n) ?? null),
    selectByTokenHash: () => Promise.resolve(null),
    count: () => Promise.resolve(byName.size),
    insertIfAbsent: () => Promise.resolve(false),
    updateTokenHash: () => Promise.resolve(),
    updateRecoveryHash: () => Promise.resolve(),
    updateTokenAndRecovery: () => Promise.resolve(),
    deleteByName: () => Promise.resolve(false),
  };
}

describe('ClaimStore (via in-memory backend)', () => {
  it('claim → stores + returns MintedCredentials with token + recoveryCode + createdAt', async () => {
    const store = createInMemoryClaimStore();
    const before = Date.now();
    const minted = await store.claim('myhub');
    expect(minted.name).toBe('myhub');
    expect(minted.token.length).toBeGreaterThan(20);
    expect(minted.recoveryCode?.length).toBeGreaterThan(20);
    expect(minted.token).not.toBe(minted.recoveryCode);
    expect(minted.createdAt).toBeGreaterThanOrEqual(before);
    expect(await store.size()).toBe(1);
  });

  it('reclaim of same name (case-insensitive) → ClaimError(taken)', async () => {
    const store = createInMemoryClaimStore();
    await store.claim('myhub');
    expect(store.claim('MyHub')).rejects.toBeInstanceOf(ClaimError);
    expect(store.claim('myhub')).rejects.toMatchObject({ code: 'taken' });
  });

  it('claim of invalid name → ClaimError(invalid-name)', async () => {
    const store = createInMemoryClaimStore();
    expect(store.claim('a')).rejects.toMatchObject({ code: 'invalid-name' });
  });

  it('claim of reserved name → ClaimError(reserved)', async () => {
    const store = createInMemoryClaimStore();
    expect(store.claim('admin')).rejects.toMatchObject({ code: 'reserved' });
  });

  it('findByToken returns the stored Claim shape (no plaintext token)', async () => {
    const store = createInMemoryClaimStore();
    const minted = await store.claim('myhub');
    const found = await store.findByToken(minted.token);
    expect(found).toEqual({ name: minted.name, createdAt: minted.createdAt });
    expect(await store.findByToken('nope')).toBeNull();
  });

  it('get returns stored Claim shape without token', async () => {
    const store = createInMemoryClaimStore();
    const minted = await store.claim('myhub');
    const got = await store.get('MyHub');
    expect(got).toEqual({ name: 'myhub', createdAt: minted.createdAt });
  });

  it('rotateToken preserves createdAt, mints new token, invalidates old, omits recoveryCode', async () => {
    const store = createInMemoryClaimStore();
    const original = await store.claim('myhub');
    const rotated = await store.rotateToken('myhub');
    expect(rotated.name).toBe(original.name);
    expect(rotated.createdAt).toBe(original.createdAt);
    expect(rotated.token).not.toBe(original.token);
    expect(rotated.recoveryCode).toBeUndefined();
    expect(await store.findByToken(original.token)).toBeNull();
    expect(await store.findByToken(rotated.token)).toEqual({
      name: rotated.name,
      createdAt: rotated.createdAt,
    });
    // The original recovery code survives a token rotation.
    if (!original.recoveryCode) {
      throw new Error('expected original recoveryCode');
    }
    const recovered = await store.recover('myhub', original.recoveryCode);
    expect(recovered.token).not.toBe(rotated.token);
  });

  it('rotateToken on unknown name → ClaimError(unknown)', async () => {
    const store = createInMemoryClaimStore();
    expect(store.rotateToken('nope')).rejects.toMatchObject({ code: 'unknown' });
  });

  describe('recover', () => {
    it('valid code → mints new token + new recovery code; old code is single-use', async () => {
      const store = createInMemoryClaimStore();
      const original = await store.claim('myhub');
      if (!original.recoveryCode) {
        throw new Error('expected recoveryCode');
      }
      const recovered = await store.recover('myhub', original.recoveryCode);
      expect(recovered.token).not.toBe(original.token);
      expect(recovered.recoveryCode).toBeDefined();
      expect(recovered.recoveryCode).not.toBe(original.recoveryCode);
      expect(await store.findByToken(original.token)).toBeNull();
      expect(await store.findByToken(recovered.token)).not.toBeNull();
      // Old recovery code is now invalid.
      expect(store.recover('myhub', original.recoveryCode)).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    it('wrong recovery code → ClaimError(unauthorized)', async () => {
      const store = createInMemoryClaimStore();
      await store.claim('myhub');
      expect(store.recover('myhub', 'wrong-code')).rejects.toMatchObject({ code: 'unauthorized' });
    });

    it('unknown name → ClaimError(unknown)', async () => {
      const store = createInMemoryClaimStore();
      expect(store.recover('nope', 'anything')).rejects.toMatchObject({ code: 'unknown' });
    });

    it('no recovery code set → ClaimError(unauthorized)', async () => {
      // Build a store whose row has recovery_hash null, simulating a claim that
      // was inserted without a recovery code (possible via direct executor access).
      const tokenHash = await hashToken('test-token');
      const row: ClaimRow = {
        name: 'myhub',
        token_hash: tokenHash,
        recovery_hash: null,
        created_at: Date.now(),
      };
      const store = createClaimStore(makeExecutorWithRow(row));
      expect(store.recover('myhub', 'any-code')).rejects.toMatchObject({ code: 'unauthorized' });
    });
  });

  describe('mintRecoveryCode', () => {
    it('returns a plaintext recovery code that replaces any prior one', async () => {
      const store = createInMemoryClaimStore();
      const original = await store.claim('myhub');
      const next = await store.mintRecoveryCode('myhub');
      expect(next).not.toBe(original.recoveryCode);
      // New code works; old code no longer works.
      const recovered = await store.recover('myhub', next);
      expect(recovered.token).toBeDefined();
      if (!original.recoveryCode) {
        throw new Error('expected original recoveryCode');
      }
      expect(store.recover('myhub', original.recoveryCode)).rejects.toMatchObject({
        code: 'unauthorized',
      });
    });

    it('unknown name → ClaimError(unknown)', async () => {
      const store = createInMemoryClaimStore();
      expect(store.mintRecoveryCode('nope')).rejects.toMatchObject({ code: 'unknown' });
    });
  });

  it('release returns true on removal, false on unknown; invalidates the token', async () => {
    const store = createInMemoryClaimStore();
    const minted = await store.claim('myhub');
    expect(await store.release('MyHub')).toBe(true);
    expect(await store.findByToken(minted.token)).toBeNull();
    expect(await store.get('myhub')).toBeNull();
    expect(await store.release('myhub')).toBe(false);
  });

  it('findByToken with empty string returns null without hitting the store', async () => {
    const store = createInMemoryClaimStore();
    await store.claim('myhub');
    // Empty token is short-circuited before the hash lookup.
    expect(await store.findByToken('')).toBeNull();
  });
});

describe('ctEqHex', () => {
  it('returns true for equal hex digests', () => {
    const hex = 'a'.repeat(64);
    expect(ctEqHex(hex, hex)).toBe(true);
  });

  it('returns false when strings have different lengths', () => {
    // Exercises the early-exit branch (line 115) — lengths differ, no loop needed.
    expect(ctEqHex('abc', 'abcd')).toBe(false);
    expect(ctEqHex('', 'a')).toBe(false);
    expect(ctEqHex('aabbcc', 'aabb')).toBe(false);
  });

  it('returns false for same-length strings that differ by one bit', () => {
    const a = 'a'.repeat(64);
    const b = `b${'a'.repeat(63)}`;
    expect(ctEqHex(a, b)).toBe(false);
  });

  it('returns true for two independent copies of the same digest', () => {
    const digest = 'deadbeef'.repeat(8);
    expect(ctEqHex(digest, digest.slice())).toBe(true);
  });
});
