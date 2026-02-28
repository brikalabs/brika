/**
 * @brika/auth/client - HTTP Client
 *
 * Simple HTTP client for making auth API calls.
 * Uses credentials: 'include' for cookie-based auth.
 */

import type { LoginRequest } from '../types';
import type { LoginResponse } from './AuthClient';

export interface HttpClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

/**
 * HTTP client for auth API calls
 */
export class AuthHttpClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetch = options.fetch || globalThis.fetch;
  }

  /**
   * Login with email and password
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    return response.json();
  }

  /**
   * Logout — server clears the session cookie
   */
  async logout(): Promise<void> {
    await this.fetch(`${this.baseUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  }

  /**
   * Verify current session (cookie sent automatically)
   */
  async verify(): Promise<boolean> {
    const response = await this.fetch(`${this.baseUrl}/api/auth/session`, {
      credentials: 'include',
    });

    return response.ok;
  }

  /**
   * Make authenticated request (cookie sent automatically)
   */
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.statusText}`);
    }

    return response.json();
  }
}
