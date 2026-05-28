/**
 * Scope grammar + access semantics tests.
 *
 *   - `*` patterns: tail-glob only (`/data/**`)
 *   - write implies read (declaring `fs:write:/data/**` lets the same
 *     plugin read the path without also declaring `fs:read:`)
 *   - `/bundle` is implicitly readable; writes are always rejected
 *     regardless of scope
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import type { FsScope } from '@brika/sdk/grants';
import { assertAccess, matches, matchesAny } from './scope';
import type { ResolvedPath } from './types';

function resolved(virtualPath: string, root: ResolvedPath['root']): ResolvedPath {
  return {
    virtualPath,
    hostPath: `/host${virtualPath}`,
    root,
    readOnly: root === '/bundle',
  };
}

describe('matches', () => {
  test('literal match', () => {
    expect(matches('/data/x', '/data/x')).toBe(true);
    expect(matches('/data/x', '/data/y')).toBe(false);
  });

  test('tail glob includes the bare prefix', () => {
    expect(matches('/data', '/data/**')).toBe(true);
  });

  test('tail glob includes everything beneath', () => {
    expect(matches('/data/x', '/data/**')).toBe(true);
    expect(matches('/data/sub/x', '/data/**')).toBe(true);
  });

  test('tail glob does NOT match a sibling prefix', () => {
    expect(matches('/databar/x', '/data/**')).toBe(false);
  });
});

describe('matchesAny', () => {
  test('any pattern in the list is sufficient', () => {
    expect(matchesAny('/data/x', ['/cache/**', '/data/x'])).toBe(true);
  });

  test('empty list always denies', () => {
    expect(matchesAny('/data/x', [])).toBe(false);
  });
});

describe('assertAccess', () => {
  test('read inside declared scope passes', () => {
    const scope: FsScope = { read: ['/data/**'], write: [] };
    expect(() => assertAccess(resolved('/data/x', '/data'), scope, 'read')).not.toThrow();
  });

  test('read outside scope throws PERMISSION_DENIED', () => {
    const scope: FsScope = { read: ['/data/**'], write: [] };
    let thrown: BrikaError | undefined;
    try {
      assertAccess(resolved('/cache/x', '/cache'), scope, 'read');
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('write inside declared write scope passes', () => {
    const scope: FsScope = { read: [], write: ['/data/**'] };
    expect(() => assertAccess(resolved('/data/x', '/data'), scope, 'write')).not.toThrow();
  });

  test('write outside scope throws', () => {
    const scope: FsScope = { read: [], write: ['/cache/**'] };
    let thrown: BrikaError | undefined;
    try {
      assertAccess(resolved('/data/x', '/data'), scope, 'write');
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('write to /bundle always throws (even with a write pattern)', () => {
    const scope: FsScope = { read: [], write: ['/bundle/**'] };
    let thrown: BrikaError | undefined;
    try {
      assertAccess(resolved('/bundle/x', '/bundle'), scope, 'write');
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('/bundle is readable without a declared read pattern', () => {
    const scope: FsScope = { read: [], write: [] };
    expect(() => assertAccess(resolved('/bundle/x', '/bundle'), scope, 'read')).not.toThrow();
  });

  test('write scope grants implicit read', () => {
    const scope: FsScope = { read: [], write: ['/data/**'] };
    // The plugin only declared write but reads should still pass for the
    // same path — saves authors the duplicate declaration.
    expect(() => assertAccess(resolved('/data/x', '/data'), scope, 'read')).not.toThrow();
  });
});
