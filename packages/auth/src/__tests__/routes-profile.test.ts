/**
 * @brika/auth - Profile Route Tests (update, avatar, password)
 */

import { describe, expect, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import type { Middleware } from '@brika/router';
import { TestApp } from '@brika/router/testing';
import { profileRoutes } from '../server/routes/profile';
import { UserService } from '../services/UserService';
import { Role, Scope, type Session, type User } from '../types';

function withSession(session: Session): Middleware {
  return async (c, next) => {
    c.set('session', session);
    await next();
  };
}

const userSession: Session = {
  id: 'sess-user',
  userId: 'user-1',
  userEmail: 'user@test.com',
  userName: 'User',
  userRole: Role.USER,
  scopes: [Scope.WORKFLOW_READ, Scope.BOARD_READ],
};

const now = new Date();

const mockUser: User = {
  id: 'user-1',
  email: 'user@test.com',
  name: 'User',
  role: Role.USER,
  avatarHash: null,
  createdAt: now,
  updatedAt: now,
  isActive: true,
  scopes: [],
};

// ─── PUT /profile ───────────────────────────────────────────────────────────

describe('PUT /profile — authenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      updateUser: (
        _id: string,
        updates: {
          name?: string;
        }
      ) => ({
        ...mockUser,
        name: updates.name ?? mockUser.name,
      }),
    });
    app = TestApp.create(profileRoutes, [withSession(userSession)]);
  });

  test('updates name and returns user', async () => {
    const res = await app.put('/profile', {
      name: 'New Name',
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      user: User;
    };
    expect(body.user.name).toBe('New Name');
  });
});

describe('PUT /profile — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(profileRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.put('/profile', {
      name: 'Test',
    });
    expect(res.status).toBe(401);
  });
});

// ─── PUT /profile/avatar — JSON base64 ─────────────────────────────────────

describe('PUT /profile/avatar — JSON base64 upload', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      setAvatar: () => 'abc12345',
    });
    app = TestApp.create(profileRoutes, [withSession(userSession)]);
  });

  test('uploads avatar from base64 JSON', async () => {
    // PNG magic bytes + minimal padding
    const pngHeader = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(100).fill(0),
    ]);
    const imageData = pngHeader.toString('base64');
    const res = await app.put('/profile/avatar', {
      data: imageData,
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      ok: boolean;
    };
    expect(body.ok).toBe(true);
  });

  test('returns 400 when data field is missing', async () => {
    const res = await app.put('/profile/avatar', {});
    expect(res.status).toBe(400);
  });
});

// ─── PUT /profile/avatar — binary upload ────────────────────────────────────

describe('PUT /profile/avatar — binary upload', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      setAvatar: () => 'bin12345',
    });
    app = TestApp.create(profileRoutes, [withSession(userSession)]);
  });

  test('uploads avatar from binary body', async () => {
    const hono = app.hono;
    // PNG magic bytes + minimal padding
    const imageBuffer = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(100).fill(0),
    ]);
    const res = await hono.fetch(
      new Request('http://test/profile/avatar', {
        method: 'PUT',
        headers: {
          'content-type': 'image/png',
        },
        body: imageBuffer,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
    };
    expect(body.ok).toBe(true);
  });

  test('returns 400 for empty binary body', async () => {
    const hono = app.hono;
    const res = await hono.fetch(
      new Request('http://test/profile/avatar', {
        method: 'PUT',
        headers: {
          'content-type': 'image/png',
        },
        body: new Uint8Array(0),
      })
    );
    expect(res.status).toBe(400);
  });

  test('returns 400 for oversized image (>5MB)', async () => {
    const hono = app.hono;
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
    const res = await hono.fetch(
      new Request('http://test/profile/avatar', {
        method: 'PUT',
        headers: {
          'content-type': 'image/png',
        },
        body: largeBuffer,
      })
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /profile/avatar — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(profileRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.put('/profile/avatar', {
      data: 'abc',
    });
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /profile/avatar ─────────────────────────────────────────────────

describe('DELETE /profile/avatar — authenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      removeAvatar: () => {},
    });
    app = TestApp.create(profileRoutes, [withSession(userSession)]);
  });

  test('removes avatar and returns ok', async () => {
    const res = await app.delete('/profile/avatar');
    expect(res.status).toBe(200);
    expect(
      (
        res.body as {
          ok: boolean;
        }
      ).ok
    ).toBe(true);
  });
});

describe('DELETE /profile/avatar — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(profileRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.delete('/profile/avatar');
    expect(res.status).toBe(401);
  });
});

// ─── PUT /profile/password ──────────────────────────────────────────────────

describe('PUT /profile/password — valid current password', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      verifyPassword: async (_userId: string, password: string) => password === 'OldPass123!',
      setPassword: async () => {},
    });
    app = TestApp.create(profileRoutes, [withSession(userSession)]);
  });

  test('changes password with valid current password', async () => {
    const res = await app.put('/profile/password', {
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
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

  test('returns 400 when current password is wrong', async () => {
    const res = await app.put('/profile/password', {
      currentPassword: 'WrongPass',
      newPassword: 'NewPass456!',
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 when fields are missing', async () => {
    const res = await app.put('/profile/password', {});
    expect(res.status).toBe(400);
  });

  test('returns 400 when only currentPassword is provided', async () => {
    const res = await app.put('/profile/password', {
      currentPassword: 'OldPass123!',
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /profile/password — setPassword throws', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      verifyPassword: async () => true,
      setPassword: async () => {
        throw new Error('Password does not meet requirements');
      },
    });
    app = TestApp.create(profileRoutes, [withSession(userSession)]);
  });

  test('returns 400 when setPassword throws (invalid new password)', async () => {
    const res = await app.put('/profile/password', {
      currentPassword: 'OldPass123!',
      newPassword: 'weak',
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /profile/password — unauthenticated', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService);
    app = TestApp.create(profileRoutes);
  });

  test('returns 401 without session', async () => {
    const res = await app.put('/profile/password', {
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass456!',
    });
    expect(res.status).toBe(401);
  });
});

// ─── GET /avatar/:userId ────────────────────────────────────────────────────

describe('GET /avatar/:userId — no avatar', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    stub(UserService, {
      getAvatarData: () => null,
    });
    // Avatar endpoint is public (no requireSession)
    app = TestApp.create(profileRoutes);
  });

  test('returns 204 when user has no avatar', async () => {
    const res = await app.get('/avatar/user-1');
    expect(res.status).toBe(204);
  });
});

describe('GET /avatar/:userId — with avatar', () => {
  let app: ReturnType<typeof TestApp.create>;
  const fakeImage = Buffer.from('PNG-FAKE');

  useTestBed(() => {
    stub(UserService, {
      getAvatarData: () => ({
        data: fakeImage,
        mimeType: 'image/webp',
      }),
    });
    app = TestApp.create(profileRoutes);
  });

  test('returns image data when avatar exists', async () => {
    const res = await app.get('/avatar/user-1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('etag')).toBeTruthy();
  });

  test('returns 304 with matching ETag', async () => {
    // First request to get the ETag
    const first = await app.get('/avatar/user-1');
    const etag = first.headers.get('etag') ?? '';
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    const second = await app.get('/avatar/user-1', {
      headers: {
        'if-none-match': etag,
      },
    });
    expect(second.status).toBe(304);
  });
});
