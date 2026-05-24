/**
 * Unit tests for `EphemeralRoots` — the registry that backs
 * `/user/<token>` virtual paths minted by `ctx.ui.pickFile`.
 */

import { describe, expect, test } from 'bun:test';
import { EphemeralRoots } from '../ephemeral';

describe('EphemeralRoots — mint + resolve', () => {
  test('mint returns a virtual path containing the file basename', () => {
    const r = new EphemeralRoots();
    const entry = r.mint('/Users/alice/photos/holiday.png');
    expect(entry.fileName).toBe('holiday.png');
    expect(entry.virtualPath).toMatch(/^\/user\/[0-9a-f]+\/holiday\.png$/);
  });

  test('resolve returns the host path for a valid virtual path', () => {
    const r = new EphemeralRoots();
    const entry = r.mint('/Users/alice/x.txt');
    expect(r.resolve(entry.virtualPath)).toBe('/Users/alice/x.txt');
  });

  test('resolve returns null for an unknown token', () => {
    const r = new EphemeralRoots();
    expect(r.resolve('/user/deadbeef/x.txt')).toBeNull();
  });

  test('resolve rejects a path that does not match the registered filename', () => {
    // Defence against a malicious plugin trying to rewrite the URL to
    // point at a different file under the same token.
    const r = new EphemeralRoots();
    const entry = r.mint('/Users/alice/x.txt');
    const tampered = entry.virtualPath.replace(/x\.txt$/, 'y.txt');
    expect(r.resolve(tampered)).toBeNull();
  });

  test('resolve returns null after the token expires', () => {
    const r = new EphemeralRoots(0);
    const entry = r.mint('/Users/alice/x.txt');
    // Sleep 1ms so the now-stamp is past expiresAt.
    Bun.sleepSync?.(1);
    expect(r.resolve(entry.virtualPath)).toBeNull();
  });

  test('revoke drops the entry; resolve returns null', () => {
    const r = new EphemeralRoots();
    const entry = r.mint('/Users/alice/x.txt');
    expect(r.revoke(entry.token)).toBe(true);
    expect(r.resolve(entry.virtualPath)).toBeNull();
  });

  test('revokeAll clears every entry', () => {
    const r = new EphemeralRoots();
    r.mint('/a/1.txt');
    r.mint('/a/2.txt');
    expect(r.size()).toBe(2);
    r.revokeAll();
    expect(r.size()).toBe(0);
  });

  test('two mints produce different tokens', () => {
    const r = new EphemeralRoots();
    const a = r.mint('/a/x.txt');
    const b = r.mint('/a/x.txt');
    expect(a.token).not.toBe(b.token);
  });
});

describe('EphemeralRoots — path-tampering defence', () => {
  test('a /user path lacking a token is rejected', () => {
    const r = new EphemeralRoots();
    expect(r.resolve('/user/x.txt')).toBeNull();
  });

  test('a token with non-hex characters is rejected', () => {
    const r = new EphemeralRoots();
    expect(r.resolve('/user/g00dluck/x.txt')).toBeNull();
  });

  test('a /user path with empty filename is rejected', () => {
    const r = new EphemeralRoots();
    const entry = r.mint('/a/x.txt');
    expect(r.resolve(`/user/${entry.token}/`)).toBeNull();
  });
});
