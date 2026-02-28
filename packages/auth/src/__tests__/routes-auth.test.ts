/**
 * @brika/auth - Auth Route Tests (login, logout, session info)
 */

import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import type { Middleware } from '@brika/router';
import { Role, Scope, type Session, type User } from '../types';
import { AuthService } from '../services/AuthService';
import { UserService } from '../services/UserService';
import { authPublicRoutes, authProtectedRoutes } from '../server/routes/auth';

const authRoutes = [...authPublicRoutes, ...authProtectedRoutes];
import { getAuthConfig } from '../config';

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

const mockUser: User = {
  id: 'user-admin',
  email: 'admin@test.com',
  name: 'Admin',
  role: Role.ADMIN,
  avatarHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true,
  scopes: [],
};

// ─── POST /login ────────────────────────────────────────────────────────────

describe('POST /login', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(AuthService, {
      login: async () => ({
        token: 'tok-abc',
        user: mockUser,
        expiresIn: 604800,
      }),
    });
    app = TestApp.create(authRoutes);
  });

  test('returns 200 with Set-Cookie on success', async () => {
    const res = await app.post('/login', { email: 'admin@test.com', password: 'secret' });
    expect(res.status).toBe(200);

    const body = res.body as { user: User };
    expect(body.user.email).toBe('admin@test.com');

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${getAuthConfig().session.cookieName}=tok-abc`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=604800');
  });

  test('extracts IP from x-forwarded-for header', async () => {
    let capturedIp: string | undefined;
    stub(AuthService, {
      login: async (_email: string, _password: string, ip?: string) => {
        capturedIp = ip;
        return { token: 'tok', user: mockUser, expiresIn: 604800 };
      },
    });
    app = TestApp.create(authRoutes);

    await app.post('/login', { email: 'a@b.com', password: 'x' }, {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(capturedIp).toBe('10.0.0.1');
  });

  test('extracts IP from x-real-ip when x-forwarded-for is absent', async () => {
    let capturedIp: string | undefined;
    stub(AuthService, {
      login: async (_email: string, _password: string, ip?: string) => {
        capturedIp = ip;
        return { token: 'tok', user: mockUser, expiresIn: 604800 };
      },
    });
    app = TestApp.create(authRoutes);

    await app.post('/login', { email: 'a@b.com', password: 'x' }, {
      headers: { 'x-real-ip': '10.0.0.2' },
    });
    expect(capturedIp).toBe('10.0.0.2');
  });

  test('returns 401 when credentials are invalid (service throws)', async () => {
    stub(AuthService, {
      login: async () => {
        throw new Error('Invalid credentials');
      },
    });
    app = TestApp.create(authRoutes);

    const res = await app.post('/login', { email: 'bad@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
    const body = res.body as { error: string };
    expect(body.error).toBe('Invalid credentials');
  });
});

// ─── POST /logout ───────────────────────────────────────────────────────────

describe('POST /logout — with session', () => {
  let app: ReturnType<typeof TestApp.create>;
  let revokedId: string | undefined;

  useTestBed(() => {
    revokedId = undefined;
    stub(AuthService, {
      logout: async (id: string) => {
        revokedId = id;
      },
    });
    app = TestApp.create(authRoutes, [withSession(adminSession)]);
  });

  test('clears session cookie when logged in', async () => {
    const res = await app.post('/logout');

    expect(res.status).toBe(200);
    expect(revokedId).toBe('sess-admin');

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${getAuthConfig().session.cookieName}=;`);
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('POST /logout — without session', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(AuthService, {
      logout: async () => {},
    });
    // No session middleware — ctx.get('session') returns null
    app = TestApp.create(authRoutes);
  });

  test('returns 200 with empty cookie when no session (silent logout)', async () => {
    const res = await app.post('/logout');

    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean };
    expect(body.ok).toBe(true);

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('Max-Age=0');
  });
});

// ─── GET /session ───────────────────────────────────────────────────────────

describe('GET /session — authenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      getUser: async () => mockUser,
    });
    app = TestApp.create(authRoutes, [withSession(adminSession)]);
  });

  test('returns user and scopes', async () => {
    const res = await app.get('/session');
    expect(res.status).toBe(200);

    const body = res.body as { user: User; scopes: Scope[] };
    expect(body.user.email).toBe('admin@test.com');
    expect(body.scopes).toEqual([Scope.ADMIN_ALL]);
  });
});

describe('GET /session — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(authRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.get('/session');
    expect(res.status).toBe(401);
  });
});
