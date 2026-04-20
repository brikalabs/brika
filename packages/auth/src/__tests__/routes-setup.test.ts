/**
 * @brika/auth - Setup Route Tests (first-run admin creation)
 */

import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { setupRoutes } from '../server/routes/setup';
import { AuthService } from '../services/AuthService';
import { UserService } from '../services/UserService';
import { Role, type User } from '../types';
import { getAuthConfig } from '../config';

const mockUser: User = {
  id: 'user-admin',
  email: 'admin@example.com',
  name: 'Admin',
  role: Role.ADMIN,
  avatarHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true,
  scopes: [],
};

const validBody = {
  email: 'admin@example.com',
  name: 'Admin',
  password: 'Secret1!',
};

// ─── POST / — success ────────────────────────────────────────────────────────

describe('POST / — success', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      hasAdmin: () => false,
      createUser: () => mockUser,
      setPassword: async () => {},
    });
    stub(AuthService, {
      login: async () => ({
        token: 'tok-setup',
        user: mockUser,
        expiresIn: 604800,
      }),
    });
    app = TestApp.create(setupRoutes);
  });

  test('returns 201 with user body and Set-Cookie header', async () => {
    const res = await app.post('/', validBody);
    expect(res.status).toBe(201);

    const body = res.body as { user: User };
    expect(body.user.email).toBe('admin@example.com');

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`${getAuthConfig().session.cookieName}=tok-setup`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=604800');
  });

  test('passes IP from x-forwarded-for to authService.login', async () => {
    let capturedIp: string | undefined;
    stub(AuthService, {
      login: async (_email: string, _password: string, ip?: string) => {
        capturedIp = ip;
        return { token: 'tok', user: mockUser, expiresIn: 604800 };
      },
    });
    app = TestApp.create(setupRoutes);

    await app.post('/', validBody, { headers: { 'x-forwarded-for': '1.2.3.4' } });
    expect(capturedIp).toBe('1.2.3.4');
  });

  test('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    let capturedIp: string | undefined;
    stub(AuthService, {
      login: async (_email: string, _password: string, ip?: string) => {
        capturedIp = ip;
        return { token: 'tok', user: mockUser, expiresIn: 604800 };
      },
    });
    app = TestApp.create(setupRoutes);

    await app.post('/', validBody, { headers: { 'x-real-ip': '5.6.7.8' } });
    expect(capturedIp).toBe('5.6.7.8');
  });
});

// ─── POST / — conflict ───────────────────────────────────────────────────────

describe('POST / — conflict', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      hasAdmin: () => true,
      createUser: () => mockUser,
      setPassword: async () => {},
    });
    stub(AuthService, {
      login: async () => ({ token: 'tok', user: mockUser, expiresIn: 604800 }),
    });
    app = TestApp.create(setupRoutes);
  });

  test('returns 409 when an admin already exists', async () => {
    const res = await app.post('/', validBody);
    expect(res.status).toBe(409);
  });
});

// ─── POST / — body validation ────────────────────────────────────────────────

describe('POST / — body validation', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      hasAdmin: () => false,
      createUser: () => mockUser,
      setPassword: async () => {},
    });
    stub(AuthService, {
      login: async () => ({ token: 'tok', user: mockUser, expiresIn: 604800 }),
    });
    app = TestApp.create(setupRoutes);
  });

  test('returns 400/422 when body is empty', async () => {
    const res = await app.post('/', {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('returns 400/422 when email is missing', async () => {
    const res = await app.post('/', { name: 'Admin', password: 'Secret1!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('returns 400/422 when password is missing', async () => {
    const res = await app.post('/', { email: 'admin@example.com', name: 'Admin' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('returns 400/422 when name is missing', async () => {
    const res = await app.post('/', { email: 'admin@example.com', password: 'Secret1!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('returns 400/422 when email is invalid', async () => {
    const res = await app.post('/', { email: 'not-an-email', name: 'Admin', password: 'Secret1!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
