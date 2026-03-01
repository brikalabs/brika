/**
 * @brika/auth - requireSession Tests
 */

import { describe, expect, it } from 'bun:test';
import { Forbidden, Unauthorized } from '@brika/router';
import { requireSession } from '../server/requireSession';
import type { Session } from '../types';
import { Role, Scope } from '../types';

function mockCtx(session: Session | null) {
  return {
    get(key: string): unknown {
      if (key === 'session') {
        return session;
      }
      return undefined;
    },
  };
}

const adminSession: Session = {
  id: 'sess-1',
  userId: 'user-1',
  userEmail: 'admin@test.com',
  userName: 'Admin',
  userRole: Role.ADMIN,
  scopes: [
    Scope.ADMIN_ALL,
  ],
};

const userSession: Session = {
  id: 'sess-2',
  userId: 'user-2',
  userEmail: 'user@test.com',
  userName: 'User',
  userRole: Role.USER,
  scopes: [
    Scope.WORKFLOW_READ,
    Scope.WORKFLOW_WRITE,
    Scope.BOARD_READ,
  ],
};

describe('requireSession', () => {
  it('should return session when present (no scope)', () => {
    const session = requireSession(mockCtx(userSession));
    expect(session).toBe(userSession);
  });

  it('should throw Unauthorized when no session', () => {
    expect(() => requireSession(mockCtx(null))).toThrow(Unauthorized);
  });

  it('should return session when scope matches', () => {
    const session = requireSession(mockCtx(userSession), Scope.WORKFLOW_READ);
    expect(session).toBe(userSession);
  });

  it('should throw Forbidden when scope does not match', () => {
    expect(() => requireSession(mockCtx(userSession), Scope.ADMIN_ALL)).toThrow(Forbidden);
  });

  it('should allow admin to access any scope', () => {
    const session = requireSession(mockCtx(adminSession), Scope.WORKFLOW_READ);
    expect(session).toBe(adminSession);
  });

  it('should accept array of scopes (any match)', () => {
    const session = requireSession(mockCtx(userSession), [
      Scope.ADMIN_ALL,
      Scope.WORKFLOW_READ,
    ]);
    expect(session).toBe(userSession);
  });

  it('should throw Forbidden when no array scopes match', () => {
    expect(() =>
      requireSession(mockCtx(userSession), [
        Scope.ADMIN_ALL,
        Scope.PLUGIN_MANAGE,
      ])
    ).toThrow(Forbidden);
  });

  it('should throw Unauthorized before checking scope when no session', () => {
    expect(() => requireSession(mockCtx(null), Scope.ADMIN_ALL)).toThrow(Unauthorized);
  });
});
