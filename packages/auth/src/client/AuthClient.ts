/**
 * Auth Client — Cookie-based session authentication
 *
 * The server sets an HttpOnly cookie on login.
 * All requests include `credentials: 'include'` so the browser sends it automatically.
 *
 * Usage:
 *   const auth = new AuthClient()
 *   const session = await auth.login(email, password)
 *   await auth.logout()
 */

export interface AuthClientConfig {
  apiUrl?: string;
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface LoginResponse {
  user: Session['user'];
}

export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatarHash: string | null;
    createdAt: string;
    updatedAt: string;
  };
  scopes?: string[];
}

export class AuthClient {
  private readonly apiUrl: string;

  constructor(config: AuthClientConfig = {}) {
    this.apiUrl =
      config.apiUrl ||
      (globalThis.window === undefined ? 'http://localhost:3001' : globalThis.window.location.origin);

    // Clean up legacy localStorage keys from pre-cookie auth
    if (globalThis.window !== undefined) {
      localStorage.removeItem('brika_token');
      localStorage.removeItem('brika_session');
    }
  }

  /**
   * Login with email and password.
   * Server sets HttpOnly cookie — no token stored client-side.
   * After the cookie is set, fetches the full session (with scopes).
   */
  async login(email: string, password: string): Promise<Session> {
    await this.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    // Cookie is now set — fetch full session including scopes
    const session = await this.getSession();
    if (!session) throw new Error('Login failed');
    return session;
  }

  /**
   * Logout — server revokes session and clears cookie.
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Silent fail — cookie will expire anyway
    }
  }

  /**
   * Get current session from server (validates cookie).
   */
  async getSession(): Promise<Session | null> {
    try {
      const data = await this.request<{ user: Session['user']; scopes: string[] }>('/api/auth/session');
      return { user: data.user, scopes: data.scopes };
    } catch {
      return null;
    }
  }

  /**
   * Update own profile (name).
   */
  async updateProfile(updates: { name?: string }): Promise<Session> {
    return this.request<Session>('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  /**
   * Upload avatar image. Processed to webp on server.
   * Returns the new avatar content hash for cache busting.
   */
  async uploadAvatar(file: Blob): Promise<string> {
    const data = await this.request<{ ok: boolean; avatarHash: string }>('/api/auth/profile/avatar', {
      method: 'PUT',
      body: file,
    });
    return data.avatarHash;
  }

  /**
   * Remove avatar.
   */
  async removeAvatar(): Promise<void> {
    await this.request('/api/auth/profile/avatar', { method: 'DELETE' });
  }

  /**
   * Get avatar URL for a user.
   * Accepts a user-like object `{ id, avatarHash }` — the hash makes the URL
   * content-addressed so the browser fetches a new image when the avatar changes.
   */
  avatarUrl(user: { id: string; avatarHash?: string | null }, options?: { size?: number; dpr?: number }): string {
    const params = new URLSearchParams();

    const dpr = options?.dpr ?? globalThis.devicePixelRatio ?? 1;
    const size = options?.size ? Math.round(options.size * dpr) : undefined;
    if (size) params.set('s', String(size));

    if (user.avatarHash) params.set('v', user.avatarHash);

    const qs = params.toString();
    const suffix = qs ? `?${qs}` : '';
    return `${this.apiUrl}/api/auth/avatar/${user.id}${suffix}`;
  }

  /**
   * List all active sessions for the current user.
   */
  async listSessions(): Promise<SessionInfo[]> {
    const data = await this.request<{ sessions: SessionInfo[] }>('/api/auth/sessions');
    return data.sessions;
  }

  /**
   * Revoke a specific session by ID.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.request<{ ok: boolean }>(`/api/auth/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Change own password. Requires current password for verification.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/api/auth/profile/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  /**
   * Revoke all sessions for the current user (signs out everywhere).
   */
  async revokeAllSessions(): Promise<void> {
    await this.request<{ ok: boolean }>('/api/auth/sessions', {
      method: 'DELETE',
    });
  }

  /**
   * Make authenticated request (cookie sent automatically).
   */
  async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.apiUrl}${url}`, {
      ...options,
      credentials: 'include',
    });

    if (response.status === 401) {
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }

    return await response.json();
  }
}

/** Singleton instance */
let authClient: AuthClient | null = null;

export function getAuthClient(config?: AuthClientConfig): AuthClient {
  authClient ??= new AuthClient(config);
  return authClient;
}

export function createAuthClient(config?: AuthClientConfig): AuthClient {
  return new AuthClient(config);
}
