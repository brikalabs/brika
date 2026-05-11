import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { ClaimError, ClaimStore, RESERVED_NAMES, validateName } from '../claims';

const tmpDirs: string[] = [];

async function makeStore(): Promise<ClaimStore> {
  const dir = await mkdtemp(join(tmpdir(), 'brika-claims-'));
  tmpDirs.push(dir);
  const store = new ClaimStore(join(dir, 'claims.json'));
  await store.load();
  return store;
}

afterAll(async () => {
  for (const dir of tmpDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('validateName', () => {
  it('accepts simple lowercase names', () => {
    expect(validateName('maxime')).toBe('maxime');
    expect(validateName('home-hub-1')).toBe('home-hub-1');
  });

  it('lower-cases the input', () => {
    expect(validateName('MAXIME')).toBe('maxime');
  });

  it('rejects too-short names', () => {
    expect(() => validateName('abc')).toThrow(ClaimError);
  });

  it('rejects names with invalid chars', () => {
    expect(() => validateName('with space')).toThrow(ClaimError);
    expect(() => validateName('with_under')).toThrow(ClaimError);
    expect(() => validateName('with.dot')).toThrow(ClaimError);
  });

  it('rejects names that start with a digit or hyphen', () => {
    expect(() => validateName('1abcd')).toThrow(ClaimError);
    expect(() => validateName('-abcd')).toThrow(ClaimError);
  });

  it('rejects names that end with a hyphen', () => {
    expect(() => validateName('abcd-')).toThrow(ClaimError);
  });

  it('rejects reserved names', () => {
    for (const reserved of RESERVED_NAMES) {
      expect(() => validateName(reserved)).toThrow(ClaimError);
    }
  });
});

describe('ClaimStore', () => {
  let store: ClaimStore;

  beforeEach(async () => {
    store = await makeStore();
  });

  it('issues a fresh token on claim and finds it back by token', async () => {
    const claim = await store.claim('maxime');
    expect(claim.name).toBe('maxime');
    expect(claim.token.length).toBeGreaterThanOrEqual(32);
    expect(store.findByToken(claim.token)?.name).toBe('maxime');
  });

  it('rejects a duplicate claim', async () => {
    await store.claim('maxime');
    await expect(store.claim('maxime')).rejects.toThrow(ClaimError);
    await expect(store.claim('Maxime')).rejects.toThrow(ClaimError);
  });

  it('persists claims to disk and reloads them', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'brika-claims-')), 'claims.json');
    const a = new ClaimStore(path);
    await a.load();
    const claim = await a.claim('maxime');

    const raw = await readFile(path, 'utf8');
    expect(raw).toContain('maxime');

    const b = new ClaimStore(path);
    await b.load();
    expect(b.get('maxime')?.token).toBe(claim.token);
    expect(b.findByToken(claim.token)?.name).toBe('maxime');
  });

  it('rotates a token and invalidates the old one', async () => {
    const original = await store.claim('maxime');
    const rotated = await store.rotateToken('maxime');
    expect(rotated.token).not.toBe(original.token);
    expect(store.findByToken(original.token)).toBeUndefined();
    expect(store.findByToken(rotated.token)?.name).toBe('maxime');
  });

  it('release removes the claim and frees the name', async () => {
    await store.claim('maxime');
    expect(await store.release('maxime')).toBe(true);
    // Free again — should be claimable.
    const reclaimed = await store.claim('maxime');
    expect(reclaimed.name).toBe('maxime');
  });

  it('release returns false for an unknown name', async () => {
    expect(await store.release('not-claimed')).toBe(false);
  });

  it('rotate throws ClaimError for an unknown name', async () => {
    await expect(store.rotateToken('nope-not-real')).rejects.toThrow(ClaimError);
  });
});
