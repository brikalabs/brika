/**
 * @brika/auth - verifyToken Middleware Tests
 *
 * Tests for token extraction (cookie + Authorization header),
 * IP forwarding, and session attachment to context.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { container } from '@brika/di';
import { initAuthConfig } from '../config';
import { verifyToken } from '../middleware/verifyToken';
import { SessionService } from '../services/SessionService';
import type { Session } from '../types';
import { Role, Scope } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockContext(
  url: string,
  options?: {
    cookie?: string;
    auth?: string;
    ip?: string;
    realIp?: string;
  }
) {
  const next = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    req: {
      url,
      header: vi.fn((name: string) => {
        if (name === 'Cookie') {
          return options?.cookie;
        }
        if (name === 'Authorization') {
          return options?.auth;
        }
        if (name === 'x-forwarded-for') {
          return options?.ip;
        }
        if (name === 'x-real-ip') {
          return options?.realIp;
        }
        return undefined;
      }),
    },
    get: vi.fn(),
    set: vi.fn(),
  };
  return {
    ctx,
    next,
  };
}

const fakeSession: Session = {
  id: 'sess-abc',
  userId: 'user-1',
  userEmail: 'user@test.com',
  userName: 'Test User',
  userRole: Role.USER,
  scopes: [
    Scope.WORKFLOW_READ,
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockSessionService = {
  validateSession: vi.fn(),
};

beforeEach(() => {
  container.clearInstances();
  container.register(SessionService, {
    useValue: mockSessionService as never,
  });
  mockSessionService.validateSession.mockReset();
  initAuthConfig(); // ensures cookieName defaults to 'brika_session'
});

afterEach(() => {
  container.clearInstances();
});

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

describe('verifyToken', () => {
  it('sets null session and calls next when no cookie or auth header', async () => {
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test');

    await middleware(ctx as never, next);

    expect(ctx.set).toHaveBeenCalledWith('session', null);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockSessionService.validateSession).not.toHaveBeenCalled();
  });

  it('extracts token from cookie and calls validateSession', async () => {
    mockSessionService.validateSession.mockReturnValue(fakeSession);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      cookie: 'brika_session=my-token-value',
    });

    await middleware(ctx as never, next);

    expect(mockSessionService.validateSession).toHaveBeenCalledWith('my-token-value', undefined);
    expect(ctx.set).toHaveBeenCalledWith('session', fakeSession);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to Authorization Bearer header when no cookie', async () => {
    mockSessionService.validateSession.mockReturnValue(fakeSession);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      auth: 'Bearer bearer-token-value',
    });

    await middleware(ctx as never, next);

    expect(mockSessionService.validateSession).toHaveBeenCalledWith(
      'bearer-token-value',
      undefined
    );
    expect(ctx.set).toHaveBeenCalledWith('session', fakeSession);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes x-forwarded-for IP to validateSession', async () => {
    mockSessionService.validateSession.mockReturnValue(fakeSession);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      cookie: 'brika_session=token-xyz',
      ip: '203.0.113.42',
    });

    await middleware(ctx as never, next);

    expect(mockSessionService.validateSession).toHaveBeenCalledWith('token-xyz', '203.0.113.42');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    mockSessionService.validateSession.mockReturnValue(fakeSession);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      cookie: 'brika_session=token-xyz',
      realIp: '198.51.100.7',
    });

    await middleware(ctx as never, next);

    expect(mockSessionService.validateSession).toHaveBeenCalledWith('token-xyz', '198.51.100.7');
  });

  it('sets session from validateSession return value on context', async () => {
    mockSessionService.validateSession.mockReturnValue(fakeSession);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      cookie: 'brika_session=valid-token',
    });

    await middleware(ctx as never, next);

    expect(ctx.set).toHaveBeenCalledWith('session', fakeSession);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets null session when validateSession returns null (expired/revoked)', async () => {
    mockSessionService.validateSession.mockReturnValue(null);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      cookie: 'brika_session=expired-token',
    });

    await middleware(ctx as never, next);

    expect(ctx.set).toHaveBeenCalledWith('session', null);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getCookieValue (via cookie parsing behaviour of the middleware)
// ---------------------------------------------------------------------------

describe('verifyToken cookie parsing', () => {
  it('handles multiple cookies and extracts the correct one', async () => {
    mockSessionService.validateSession.mockReturnValue(fakeSession);
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      // brika_session is the second cookie in the header string
      cookie: 'other_cookie=irrelevant; brika_session=correct-token; another=value',
    });

    await middleware(ctx as never, next);

    expect(mockSessionService.validateSession).toHaveBeenCalledWith('correct-token', undefined);
  });

  it('sets null session when the cookie name is not present in the header', async () => {
    const middleware = verifyToken();
    const { ctx, next } = mockContext('http://localhost:3001/api/test', {
      // Cookie header exists but does not contain brika_session
      cookie: 'some_other_cookie=value',
    });

    await middleware(ctx as never, next);

    expect(mockSessionService.validateSession).not.toHaveBeenCalled();
    expect(ctx.set).toHaveBeenCalledWith('session', null);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
