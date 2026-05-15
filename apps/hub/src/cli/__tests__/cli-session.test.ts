/**
 * Local-trust CLI token resolver. Verifies constant-time matching
 * and that mismatched / wrong-length tokens fall through to `null`
 * so the auth middleware can keep walking the chain.
 */
import { describe, expect, it } from 'bun:test';
import { Role, Scope } from '@brika/auth';
import { makeCliTokenResolver } from '../utils/cli-session';

describe('makeCliTokenResolver', () => {
  const token = 'a'.repeat(64);
  const resolver = makeCliTokenResolver(token);

  it('returns an admin session for the exact token', () => {
    const session = resolver(token);
    expect(session).not.toBeNull();
    expect(session?.userRole).toBe(Role.ADMIN);
    expect(session?.scopes).toContain(Scope.ADMIN_ALL);
    expect(session?.userEmail).toBe('cli@local');
  });

  it('returns null for a token of the wrong length', () => {
    expect(resolver('short')).toBeNull();
    expect(resolver(`${token}extra`)).toBeNull();
  });

  it('returns null for a same-length but different token', () => {
    expect(resolver('b'.repeat(64))).toBeNull();
  });

  it('returns null for an empty token', () => {
    expect(resolver('')).toBeNull();
  });

  it('keeps each resolver instance independent', () => {
    const otherResolver = makeCliTokenResolver('b'.repeat(64));
    expect(otherResolver(token)).toBeNull();
    expect(resolver('b'.repeat(64))).toBeNull();
  });
});
