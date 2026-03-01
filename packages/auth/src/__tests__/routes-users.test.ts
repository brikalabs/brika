/**
 * @brika/auth - User Route Tests (CRUD, password reset)
 */

import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import type { Middleware } from '@brika/router';
import { TestApp } from '@brika/router/testing';
import { userRoutes } from '../server/routes/users';
import { UserService } from '../services/UserService';
import { Role, Scope, type Session, type User } from '../types';

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
  scopes: [
    Scope.ADMIN_ALL,
  ],
};

const userSession: Session = {
  id: 'sess-user',
  userId: 'user-regular',
  userEmail: 'user@test.com',
  userName: 'User',
  userRole: Role.USER,
  scopes: [
    Scope.WORKFLOW_READ,
    Scope.BOARD_READ,
  ],
};

const now = new Date();

const adminUser: User = {
  id: 'user-admin',
  email: 'admin@test.com',
  name: 'Admin',
  role: Role.ADMIN,
  avatarHash: null,
  createdAt: now,
  updatedAt: now,
  isActive: true,
  scopes: [],
};

const regularUser: User = {
  id: 'user-regular',
  email: 'user@test.com',
  name: 'User',
  role: Role.USER,
  avatarHash: null,
  createdAt: now,
  updatedAt: now,
  isActive: true,
  scopes: [],
};

// ─── GET /api/users ─────────────────────────────────────────────────────────

describe('GET /api/users — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      listUsers: () => [
        adminUser,
        regularUser,
      ],
    });
    app = TestApp.create(userRoutes, [
      withSession(adminSession),
    ]);
  });

  test('returns list of users', async () => {
    const res = await app.get('/api/users');
    expect(res.status).toBe(200);
    const body = res.body as {
      users: User[];
    };
    expect(body.users).toHaveLength(2);
  });
});

describe('GET /api/users — as regular user', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes, [
      withSession(userSession),
    ]);
  });

  test('returns 403 without admin scope', async () => {
    const res = await app.get('/api/users');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.get('/api/users');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/users ────────────────────────────────────────────────────────

describe('POST /api/users — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;
  let setPasswordCalled: boolean;

  useTestBed(() => {
    setPasswordCalled = false;
    stub(UserService, {
      createUser: (email: string, name: string, role: Role) => ({
        ...regularUser,
        id: 'new-user',
        email,
        name,
        role,
      }),
      setPassword: async () => {
        setPasswordCalled = true;
      },
    });
    app = TestApp.create(userRoutes, [
      withSession(adminSession),
    ]);
  });

  test('creates user and returns user object', async () => {
    const res = await app.post('/api/users', {
      email: 'new@test.com',
      name: 'New User',
      role: Role.USER,
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      status: number;
      body: {
        user: User;
      };
    };
    expect(body.body.user.email).toBe('new@test.com');
  });

  test('sets password when provided', async () => {
    await app.post('/api/users', {
      email: 'new@test.com',
      name: 'New User',
      role: Role.USER,
      password: 'Secret123!',
    });
    expect(setPasswordCalled).toBe(true);
  });

  test('skips setPassword when password is not provided', async () => {
    await app.post('/api/users', {
      email: 'new@test.com',
      name: 'New User',
      role: Role.USER,
    });
    expect(setPasswordCalled).toBe(false);
  });
});

describe('POST /api/users — as regular user', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes, [
      withSession(userSession),
    ]);
  });

  test('returns 403 for non-admin', async () => {
    const res = await app.post('/api/users', {
      email: 'test@y.com',
      name: 'Test',
      role: Role.USER,
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/users — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.post('/api/users', {
      email: 'test@y.com',
      name: 'Test',
      role: Role.USER,
    });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/users/:id ─────────────────────────────────────────────────────

describe('GET /api/users/:id — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      getUser: (id: string) => {
        if (id === 'user-regular') {
          return regularUser;
        }
        if (id === 'user-admin') {
          return adminUser;
        }
        return null;
      },
    });
    app = TestApp.create(userRoutes, [
      withSession(adminSession),
    ]);
  });

  test('returns user by id', async () => {
    const res = await app.get('/api/users/user-regular');
    expect(res.status).toBe(200);
    const body = res.body as {
      user: User;
    };
    expect(body.user.email).toBe('user@test.com');
  });

  test('returns 404 for unknown user', async () => {
    const res = await app.get('/api/users/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/users/:id — as regular user', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      getUser: () => regularUser,
    });
    app = TestApp.create(userRoutes, [
      withSession(userSession),
    ]);
  });

  test('can access own profile', async () => {
    const res = await app.get('/api/users/user-regular');
    expect(res.status).toBe(200);
  });

  test('returns 403 when accessing another user', async () => {
    const res = await app.get('/api/users/user-admin');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users/:id — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.get('/api/users/user-admin');
    expect(res.status).toBe(401);
  });
});

// ─── PUT /api/users/:id/password ────────────────────────────────────────────

describe('PUT /api/users/:id/password — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      getUser: (id: string) => (id === 'user-regular' ? regularUser : null),
      setPassword: async () => {},
    });
    app = TestApp.create(userRoutes, [
      withSession(adminSession),
    ]);
  });

  test('resets password for existing user', async () => {
    const res = await app.put('/api/users/user-regular/password', {
      password: 'NewPass123!',
    });
    expect(res.status).toBe(200);
    expect(
      (
        res.body as {
          ok: boolean;
        }
      ).ok
    ).toBe(true);
  });

  test('returns 400 when password is missing', async () => {
    const res = await app.put('/api/users/user-regular/password', {});
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown user', async () => {
    const res = await app.put('/api/users/nonexistent/password', {
      password: 'ValidPass123!',
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/users/:id/password — as regular user', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes, [
      withSession(userSession),
    ]);
  });

  test('returns 403 for non-admin', async () => {
    const res = await app.put('/api/users/user-regular/password', {
      password: 'ValidPass123!',
    });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:id/password — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.put('/api/users/user-regular/password', {
      password: 'ValidPass123!',
    });
    expect(res.status).toBe(401);
  });
});

// ─── PUT /api/users/:id ─────────────────────────────────────────────────────

describe('PUT /api/users/:id — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      updateUser: (
        _id: string,
        updates: {
          name?: string;
        }
      ) => ({
        ...regularUser,
        name: updates.name ?? regularUser.name,
      }),
    });
    app = TestApp.create(userRoutes, [
      withSession(adminSession),
    ]);
  });

  test('updates user fields', async () => {
    const res = await app.put('/api/users/user-regular', {
      name: 'Updated Name',
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      user: User;
    };
    expect(body.user.name).toBe('Updated Name');
  });
});

describe('PUT /api/users/:id — as regular user', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes, [
      withSession(userSession),
    ]);
  });

  test('returns 403 for non-admin', async () => {
    const res = await app.put('/api/users/user-regular', {
      name: 'Test',
    });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/users/:id — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.put('/api/users/user-regular', {
      name: 'Test',
    });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /api/users/:id ──────────────────────────────────────────────────

describe('DELETE /api/users/:id — as admin', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      getUser: (id: string) => (id === 'user-regular' ? regularUser : null),
      deleteUser: () => {},
    });
    app = TestApp.create(userRoutes, [
      withSession(adminSession),
    ]);
  });

  test('deletes another user', async () => {
    const res = await app.delete('/api/users/user-regular');
    expect(res.status).toBe(200);
    expect(
      (
        res.body as {
          ok: boolean;
        }
      ).ok
    ).toBe(true);
  });

  test('returns 400 when trying to self-delete', async () => {
    const res = await app.delete('/api/users/user-admin');
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown user', async () => {
    const res = await app.delete('/api/users/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/:id — as regular user', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes, [
      withSession(userSession),
    ]);
  });

  test('returns 403 for non-admin', async () => {
    const res = await app.delete('/api/users/user-regular');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/users/:id — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(userRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.delete('/api/users/user-regular');
    expect(res.status).toBe(401);
  });
});
