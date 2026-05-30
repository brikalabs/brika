import { describe, expect, it } from 'bun:test';
import { ClaimError } from './claims-validation';
import { createInMemoryClaimStore } from './testing';

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
});
