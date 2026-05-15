/**
 * Local-trust CLI token resolver. Reads `${BRIKA_HOME}/cli-token` on
 * every call so a freshly-rotated token is picked up without
 * restarting the hub. Verifies constant-time matching and that
 * missing / mismatched / wrong-length tokens fall through to `null`
 * so the auth middleware can keep walking the chain.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Role, Scope } from '@brika/auth';
import { makeCliTokenResolver } from '../utils/cli-session';

describe('makeCliTokenResolver', () => {
  let home: string;
  let original: string | undefined;
  const token = 'a'.repeat(64);

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-cli-resolver-'));
    original = process.env.BRIKA_HOME;
    process.env.BRIKA_HOME = home;
    writeFileSync(join(home, 'cli-token'), token, 'utf8');
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = original;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it('returns an admin session for the exact token', () => {
    const session = makeCliTokenResolver()(token);
    expect(session).not.toBeNull();
    expect(session?.userRole).toBe(Role.ADMIN);
    expect(session?.scopes).toContain(Scope.ADMIN_ALL);
    expect(session?.userEmail).toBe('cli@local');
  });

  it('returns null for a token of the wrong length', () => {
    const resolver = makeCliTokenResolver();
    expect(resolver('short')).toBeNull();
    expect(resolver(`${token}extra`)).toBeNull();
  });

  it('returns null for a same-length but different token', () => {
    expect(makeCliTokenResolver()('b'.repeat(64))).toBeNull();
  });

  it('returns null for an empty token', () => {
    expect(makeCliTokenResolver()('')).toBeNull();
  });

  it('returns null when the token file is missing', () => {
    rmSync(join(home, 'cli-token'));
    expect(makeCliTokenResolver()(token)).toBeNull();
  });

  it('picks up a rotated token without rebuilding the resolver', () => {
    const resolver = makeCliTokenResolver();
    expect(resolver(token)).not.toBeNull();

    const next = 'b'.repeat(64);
    writeFileSync(join(home, 'cli-token'), next, 'utf8');
    expect(resolver(token)).toBeNull(); // old token now invalid
    expect(resolver(next)).not.toBeNull(); // new token works on the SAME resolver
  });
});
