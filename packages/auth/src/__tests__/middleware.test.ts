/**
 * @brika/auth - Middleware Tests
 *
 * Tests for requireAuth and requireScope middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'bun:test';
import { container } from '@brika/di';
import { requireAuth } from '../middleware/requireAuth';
import { requireScope } from '../middleware/requireScope';
import { ScopeService } from '../services/ScopeService';
import { Role, Scope } from '../types';
import type { Session } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  userId: 'user-1',
  userEmail: 'user@test.com',
  userName: 'User',
  userRole: Role.USER,
  scopes: [Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE, Scope.BOARD_READ],
};

function mockContext(url: string, session: Session | null = null) {
  const next = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    req: { url, header: vi.fn().mockReturnValue(undefined) },
    get: vi.fn((key: string) => {
      if (key === 'session') return session;
      return undefined;
    }),
    set: vi.fn(),
    json: vi.fn((body: unknown, status?: number) =>
      new Response(JSON.stringify(body), { status: status ?? 200 })
    ),
  };
  return { ctx, next };
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  const middleware = requireAuth();

  it('should call next when session exists', async () => {
    const { ctx, next } = mockContext('http://localhost:3001/api/test', userSession);
    await middleware(ctx as never, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('should return 401 when no session', async () => {
    const { ctx, next } = mockContext('http://localhost:3001/api/test');
    await middleware(ctx as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401);
  });

  it('should call next for admin session', async () => {
    const { ctx, next } = mockContext('http://localhost:3001/api/admin', adminSession);
    await middleware(ctx as never, next);
    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireScope
// ---------------------------------------------------------------------------

describe('requireScope', () => {
  beforeEach(() => {
    container.clearInstances();
    // ScopeService has no dependencies — register it directly
    container.register(ScopeService, { useClass: ScopeService });
  });

  afterEach(() => {
    container.clearInstances();
  });

  it('should call next when session has the required scope', async () => {
    const middleware = requireScope(Scope.WORKFLOW_READ);
    const { ctx, next } = mockContext('http://localhost:3001/api/workflows', userSession);
    await middleware(ctx as never, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('should return 403 when session lacks the required scope', async () => {
    const middleware = requireScope(Scope.PLUGIN_MANAGE);
    const { ctx, next } = mockContext('http://localhost:3001/api/plugins', userSession);
    await middleware(ctx as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalled();
    const [body, status] = ctx.json.mock.calls[0];
    expect(status).toBe(403);
    expect(body.error).toBe('insufficient_permissions');
    expect(body.message).toBe('This operation requires additional permissions');
  });

  it('should return 401 when no session at all', async () => {
    const middleware = requireScope(Scope.WORKFLOW_READ);
    const { ctx, next } = mockContext('http://localhost:3001/api/workflows');
    await middleware(ctx as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalled();
    const [body, status] = ctx.json.mock.calls[0];
    expect(status).toBe(401);
    expect(body.error).toBe('unauthorized');
  });

  it('should allow admin to bypass any scope check', async () => {
    const middleware = requireScope(Scope.PLUGIN_MANAGE);
    const { ctx, next } = mockContext('http://localhost:3001/api/plugins', adminSession);
    await middleware(ctx as never, next);
    expect(next).toHaveBeenCalled();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('should accept an array of scopes (any match)', async () => {
    const middleware = requireScope([Scope.PLUGIN_MANAGE, Scope.WORKFLOW_READ]);
    const { ctx, next } = mockContext('http://localhost:3001/api/mixed', userSession);
    await middleware(ctx as never, next);
    // userSession has WORKFLOW_READ, so should pass
    expect(next).toHaveBeenCalled();
  });

  it('should return 403 when none of the array scopes match', async () => {
    const middleware = requireScope([Scope.PLUGIN_MANAGE, Scope.SETTINGS_WRITE]);
    const { ctx, next } = mockContext('http://localhost:3001/api/admin-op', userSession);
    await middleware(ctx as never, next);
    expect(next).not.toHaveBeenCalled();
    const [body, status] = ctx.json.mock.calls[0];
    expect(status).toBe(403);
    expect(body.error).toBe('insufficient_permissions');
  });

  it('should not leak user scopes in 403 response', async () => {
    const middleware = requireScope(Scope.SETTINGS_WRITE);
    const { ctx, next } = mockContext('http://localhost:3001/api/settings', userSession);
    await middleware(ctx as never, next);
    const [body] = ctx.json.mock.calls[0];
    expect(body.required).toBeUndefined();
    expect(body.provided).toBeUndefined();
  });
});
