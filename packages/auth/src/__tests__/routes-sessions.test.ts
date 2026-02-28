/**
 * @brika/auth - Session Route Tests (list, revoke, revoke all)
 */

import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import type { Middleware } from '@brika/router';
import { Role, Scope, type Session, type SessionRecord } from '../types';
import { SessionService } from '../services/SessionService';
import { sessionRoutes } from '../server/routes/sessions';

function withSession(session: Session): Middleware {
  return async (c, next) => {
    c.set('session', session);
    await next();
  };
}

const adminSession: Session = {
  id: 'sess-admin',
  userId: 'user-admin',
  userEmail: 'admin@test.com',
  userName: 'Admin',
  userRole: Role.ADMIN,
  scopes: [Scope.ADMIN_ALL],
};

const userSession: Session = {
  id: 'sess-user',
  userId: 'user-regular',
  userEmail: 'user@test.com',
  userName: 'User',
  userRole: Role.USER,
  scopes: [Scope.WORKFLOW_READ, Scope.BOARD_READ],
};

const now = Date.now();

const mockUserSessions: SessionRecord[] = [
  {
    id: 'sess-user',
    userId: 'user-regular',
    tokenHash: 'hash1',
    ip: '127.0.0.1',
    userAgent: 'TestBrowser',
    createdAt: now - 10000,
    lastSeenAt: now,
    expiresAt: now + 604800000,
    revokedAt: null,
  },
  {
    id: 'sess-user-2',
    userId: 'user-regular',
    tokenHash: 'hash2',
    ip: '10.0.0.1',
    userAgent: 'OtherBrowser',
    createdAt: now - 20000,
    lastSeenAt: now - 5000,
    expiresAt: now + 604800000,
    revokedAt: null,
  },
];

// ─── GET /sessions ──────────────────────────────────────────────────────────

describe('GET /sessions — authenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(SessionService, {
      listUserSessions: () => mockUserSessions,
    });
    app = TestApp.create(sessionRoutes, [withSession(userSession)]);
  });

  test('returns sessions for current user with current flag', async () => {
    const res = await app.get('/sessions');
    expect(res.status).toBe(200);

    const body = res.body as {
      sessions: Array<{
        id: string;
        ip: string | null;
        userAgent: string | null;
        createdAt: number;
        lastSeenAt: number;
        current: boolean;
      }>;
    };
    expect(body.sessions).toHaveLength(2);

    const current = body.sessions.find((s) => s.id === 'sess-user');
    expect(current?.current).toBe(true);

    const other = body.sessions.find((s) => s.id === 'sess-user-2');
    expect(other?.current).toBe(false);
  });

  test('strips sensitive fields (tokenHash, expiresAt, revokedAt)', async () => {
    const res = await app.get('/sessions');
    const body = res.body as { sessions: Array<Record<string, unknown>> };
    for (const session of body.sessions) {
      expect(session.tokenHash).toBeUndefined();
      expect(session.expiresAt).toBeUndefined();
      expect(session.revokedAt).toBeUndefined();
    }
  });
});

describe('GET /sessions — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(SessionService);
    app = TestApp.create(sessionRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.get('/sessions');
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /sessions/:id ───────────────────────────────────────────────────

describe('DELETE /sessions/:id — as session owner', () => {
  let app: ReturnType<typeof TestApp.create>;
  let revokedId: string | undefined;

  useTestBed(() => {
    revokedId = undefined;
    stub(SessionService, {
      listUserSessions: () => mockUserSessions,
      revokeSession: (id: string) => {
        revokedId = id;
      },
    });
    app = TestApp.create(sessionRoutes, [withSession(userSession)]);
  });

  test('revokes own session', async () => {
    const res = await app.delete('/sessions/sess-user-2');
    expect(res.status).toBe(200);
    expect(revokedId).toBe('sess-user-2');
  });

  test('returns 403 when revoking another users session', async () => {
    const res = await app.delete('/sessions/sess-foreign');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /sessions/:id — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;
  let revokedId: string | undefined;

  useTestBed(() => {
    revokedId = undefined;
    stub(SessionService, {
      // Admin's own sessions do NOT include 'sess-user-2', but admin can still revoke it
      listUserSessions: () => [],
      revokeSession: (id: string) => {
        revokedId = id;
      },
    });
    app = TestApp.create(sessionRoutes, [withSession(adminSession)]);
  });

  test('can revoke any session via admin scope', async () => {
    const res = await app.delete('/sessions/sess-user-2');
    expect(res.status).toBe(200);
    expect(revokedId).toBe('sess-user-2');
  });
});

describe('DELETE /sessions/:id — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(SessionService);
    app = TestApp.create(sessionRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.delete('/sessions/sess-user');
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /sessions ───────────────────────────────────────────────────────

describe('DELETE /sessions — authenticated', () => {
  let app: ReturnType<typeof TestApp.create>;
  let revokedUserId: string | undefined;

  useTestBed(() => {
    revokedUserId = undefined;
    stub(SessionService, {
      revokeAllUserSessions: (userId: string) => {
        revokedUserId = userId;
      },
    });
    app = TestApp.create(sessionRoutes, [withSession(userSession)]);
  });

  test('revokes all sessions for current user', async () => {
    const res = await app.delete('/sessions');
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect(revokedUserId).toBe('user-regular');
  });
});

describe('DELETE /sessions — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(SessionService);
    app = TestApp.create(sessionRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.delete('/sessions');
    expect(res.status).toBe(401);
  });
});
