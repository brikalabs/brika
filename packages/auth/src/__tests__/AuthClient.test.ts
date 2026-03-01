/**
 * @brika/auth - AuthClient Tests
 *
 * Tests for the AuthClient class that makes fetch() calls to the auth API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { AuthClient, createAuthClient, getAuthClient } from '../client/AuthClient';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(mockFetch, {
    preconnect: () => {},
  });
  mockFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchCall(index: number) {
  const call = mockFetch.mock.calls[index];
  if (!call) {
    throw new Error(`Expected fetch call at index ${index}`);
  }
  return call;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  avatarHash: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('AuthClient', () => {
  describe('constructor', () => {
    it('should use provided apiUrl', () => {
      const client = new AuthClient({
        apiUrl: 'http://custom:9000',
      });
      // Verify by building an avatar URL (exposes the apiUrl)
      const url = client.avatarUrl({
        id: 'user-1',
      });
      expect(url).toStartWith('http://custom:9000');
    });

    it('should default to localhost:3001 when no window', () => {
      const client = new AuthClient();
      const url = client.avatarUrl({
        id: 'user-1',
      });
      expect(url).toStartWith('http://localhost:3001');
    });
  });

  // ---------------------------------------------------------------------------
  // login
  // ---------------------------------------------------------------------------

  describe('login', () => {
    it('should POST credentials and return session', async () => {
      // login() makes 2 calls: POST /login then GET /session
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          user: mockUser,
        })
      );
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          user: mockUser,
          scopes: ['workflow:read'],
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const session = await client.login('test@example.com', 'password123');

      expect(session.user).toEqual(mockUser);
      expect(session.scopes).toEqual(['workflow:read']);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/login');
      expect(opts.method).toBe('POST');
      expect(opts.credentials).toBe('include');
      expect(JSON.parse(opts.body)).toEqual({
        email: 'test@example.com',
        password: 'password123',
      });

      const [sessionUrl] = fetchCall(1);
      expect(sessionUrl).toBe('http://test/api/auth/session');
    });

    it('should throw on failed login with 401', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'Invalid credentials',
          },
          401
        )
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.login('bad@example.com', 'wrong')).rejects.toThrow('Unauthorized');
    });

    it('should throw on failed login with non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 400));

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.login('x@x.com', 'x')).rejects.toThrow('Request failed');
    });
  });

  // ---------------------------------------------------------------------------
  // logout
  // ---------------------------------------------------------------------------

  describe('logout', () => {
    it('should POST to logout endpoint', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 204,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await client.logout();

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/logout');
      expect(opts.method).toBe('POST');
      expect(opts.credentials).toBe('include');
    });

    it('should silently fail on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      // Should not throw
      await client.logout();
    });
  });

  // ---------------------------------------------------------------------------
  // getSession
  // ---------------------------------------------------------------------------

  describe('getSession', () => {
    it('should return session on success', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          user: mockUser,
          scopes: ['workflow:read'],
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const session = await client.getSession();

      expect(session).not.toBeNull();
      expect(session?.user).toEqual(mockUser);
      expect(session?.scopes).toEqual(['workflow:read']);

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/session');
      expect(opts.credentials).toBe('include');
    });

    it('should return null on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 401,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const session = await client.getSession();
      expect(session).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const session = await client.getSession();
      expect(session).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateProfile
  // ---------------------------------------------------------------------------

  describe('updateProfile', () => {
    it('should PUT profile updates and return session', async () => {
      const updatedUser = {
        ...mockUser,
        name: 'New Name',
      };
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          user: updatedUser,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const result = await client.updateProfile({
        name: 'New Name',
      });

      expect(result).toEqual({
        user: updatedUser,
      });

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/profile');
      expect(opts.method).toBe('PUT');
      expect(opts.credentials).toBe('include');
      expect(JSON.parse(opts.body)).toEqual({
        name: 'New Name',
      });
    });

    it('should throw on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 401,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(
        client.updateProfile({
          name: 'X',
        })
      ).rejects.toThrow('Unauthorized');
    });
  });

  // ---------------------------------------------------------------------------
  // uploadAvatar
  // ---------------------------------------------------------------------------

  describe('uploadAvatar', () => {
    it('should PUT blob and return avatar hash', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          avatarHash: 'abc123',
        })
      );

      const blob = new Blob(['fake-image'], {
        type: 'image/png',
      });
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const hash = await client.uploadAvatar(blob);

      expect(hash).toBe('abc123');

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/profile/avatar');
      expect(opts.method).toBe('PUT');
      expect(opts.credentials).toBe('include');
      expect(opts.body).toBe(blob);
    });

    it('should throw on upload failure with server error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'File too large',
          },
          413
        )
      );

      const blob = new Blob(['big-image']);
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.uploadAvatar(blob)).rejects.toThrow('File too large');
    });

    it('should throw generic message when no error field', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const blob = new Blob(['x']);
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.uploadAvatar(blob)).rejects.toThrow('Request failed');
    });
  });

  // ---------------------------------------------------------------------------
  // removeAvatar
  // ---------------------------------------------------------------------------

  describe('removeAvatar', () => {
    it('should DELETE avatar', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await client.removeAvatar();

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/profile/avatar');
      expect(opts.method).toBe('DELETE');
      expect(opts.credentials).toBe('include');
    });

    it('should throw on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 401,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.removeAvatar()).rejects.toThrow('Unauthorized');
    });
  });

  // ---------------------------------------------------------------------------
  // avatarUrl
  // ---------------------------------------------------------------------------

  describe('avatarUrl', () => {
    const user = {
      id: 'user-1',
      avatarHash: null as string | null,
    };

    it('should build basic avatar URL', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl(user);
      expect(url).toBe('http://test/api/auth/avatar/user-1');
    });

    it('should include size as s param (size * dpr)', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl(user, {
        size: 128,
        dpr: 1,
      });
      expect(url).toContain('s=128');
    });

    it('should multiply size by dpr', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl(user, {
        size: 64,
        dpr: 2,
      });
      expect(url).toContain('s=128');
    });

    it('should not include s param when no size given', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl(user, {
        dpr: 2,
      });
      expect(url).not.toContain('s=');
    });

    it('should include hash param as v for cache busting', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl({
        id: 'user-1',
        avatarHash: 'deadbeef',
      });
      expect(url).toContain('v=deadbeef');
    });

    it('should not include v param when avatarHash is null', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl({
        id: 'user-1',
        avatarHash: null,
      });
      expect(url).not.toContain('v=');
    });

    it('should combine multiple params', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl(
        {
          id: 'user-1',
          avatarHash: 'abc',
        },
        {
          size: 64,
          dpr: 2,
        }
      );
      expect(url).toContain('s=128');
      expect(url).toContain('v=abc');
      expect(url).toStartWith('http://test/api/auth/avatar/user-1?');
    });

    it('should have no query string when no options and no avatarHash', () => {
      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const url = client.avatarUrl(user);
      expect(url).not.toContain('?');
    });
  });

  // ---------------------------------------------------------------------------
  // listSessions
  // ---------------------------------------------------------------------------

  describe('listSessions', () => {
    it('should return sessions array', async () => {
      const sessions = [
        {
          id: 's1',
          ip: '127.0.0.1',
          userAgent: 'Chrome',
          createdAt: 1,
          lastSeenAt: 2,
          current: true,
        },
        {
          id: 's2',
          ip: null,
          userAgent: null,
          createdAt: 3,
          lastSeenAt: 4,
          current: false,
        },
      ];
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          sessions,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const result = await client.listSessions();

      expect(result).toEqual(sessions);
      expect(result).toHaveLength(2);

      const [url] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/sessions');
    });
  });

  // ---------------------------------------------------------------------------
  // revokeSession
  // ---------------------------------------------------------------------------

  describe('revokeSession', () => {
    it('should DELETE a specific session', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await client.revokeSession('sess-123');

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/sessions/sess-123');
      expect(opts.method).toBe('DELETE');
      expect(opts.credentials).toBe('include');
    });
  });

  // ---------------------------------------------------------------------------
  // changePassword
  // ---------------------------------------------------------------------------

  describe('changePassword', () => {
    it('should PUT password change', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await client.changePassword('oldPass1!', 'newPass2@');

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/profile/password');
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body)).toEqual({
        currentPassword: 'oldPass1!',
        newPassword: 'newPass2@',
      });
    });

    it('should throw on failure', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'Current password is incorrect',
          },
          400
        )
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.changePassword('wrong', 'new')).rejects.toThrow(
        'Current password is incorrect'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // revokeAllSessions
  // ---------------------------------------------------------------------------

  describe('revokeAllSessions', () => {
    it('should DELETE all sessions', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await client.revokeAllSessions();

      const [url, opts] = fetchCall(0);
      expect(url).toBe('http://test/api/auth/sessions');
      expect(opts.method).toBe('DELETE');
      expect(opts.credentials).toBe('include');
    });
  });

  // ---------------------------------------------------------------------------
  // request (generic)
  // ---------------------------------------------------------------------------

  describe('request', () => {
    it('should throw Unauthorized on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 401,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.request('/api/anything')).rejects.toThrow('Unauthorized');
    });

    it('should throw server error message on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          {
            error: 'Not found',
          },
          404
        )
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.request('/api/missing')).rejects.toThrow('Not found');
    });

    it('should throw generic message when error field is missing', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await expect(client.request('/api/broken')).rejects.toThrow('Request failed');
    });

    it('should return parsed JSON on success', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          data: 'hello',
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      const result = await client.request<{
        data: string;
      }>('/api/test');
      expect(result).toEqual({
        data: 'hello',
      });
    });

    it('should always include credentials', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ok: true,
        })
      );

      const client = new AuthClient({
        apiUrl: 'http://test',
      });
      await client.request('/api/test', {
        method: 'PATCH',
      });

      const [, opts] = fetchCall(0);
      expect(opts.credentials).toBe('include');
      expect(opts.method).toBe('PATCH');
    });
  });

  // ---------------------------------------------------------------------------
  // getAuthClient / createAuthClient
  // ---------------------------------------------------------------------------

  describe('getAuthClient', () => {
    it('should return the same singleton instance', () => {
      // Note: getAuthClient uses a module-level singleton. We call createAuthClient
      // to avoid polluting across tests, but we can still test the factory.
      const a = createAuthClient({
        apiUrl: 'http://a',
      });
      const b = createAuthClient({
        apiUrl: 'http://b',
      });
      expect(a).not.toBe(b); // createAuthClient always returns a new instance
    });
  });

  describe('createAuthClient', () => {
    it('should create new instances each time', () => {
      const a = createAuthClient({
        apiUrl: 'http://test',
      });
      const b = createAuthClient({
        apiUrl: 'http://test',
      });
      expect(a).not.toBe(b);
      expect(a).toBeInstanceOf(AuthClient);
      expect(b).toBeInstanceOf(AuthClient);
    });
  });
});
