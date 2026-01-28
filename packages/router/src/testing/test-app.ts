/**
 * TestApp - Router Testing Utility
 *
 * Provides a fluent API for testing routes without starting a real server.
 * Uses Hono's in-memory request handling for fast, isolated tests.
 *
 * @example
 * const app = TestApp.create(healthRoutes);
 * const res = await app.get('/api/health');
 * expect(res.ok).toBeTrue();
 * expect(res.body.version).toBeDefined();
 */

import type { Hono } from 'hono';
import { createApp } from '../create-app';
import type { HttpMethod, RouteDefinition } from '../types';

const TEST_BASE_URL = 'http://test';
const JSON_CONTENT_TYPE = 'application/json';

interface TestResponse<T = unknown> {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Parsed response body (JSON or text) */
  body: T;
  /** Whether the response status is 2xx */
  ok: boolean;
  /** Original Response object for advanced use cases */
  raw: Response;
}

interface RequestOptions {
  /** Custom headers to include in the request */
  headers?: Record<string, string>;
  /** Query parameters to append to the URL */
  query?: Record<string, string>;
}

function buildUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(path, TEST_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function parseResponseBody<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes(JSON_CONTENT_TYPE)) {
    return response.json() as Promise<T>;
  }
  return response.text() as Promise<T>;
}

class TestAppInstance {
  readonly #app: Hono;

  constructor(app: Hono) {
    this.#app = app;
  }

  /**
   * Make an HTTP request with the given method.
   */
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<TestResponse<T>> {
    const url = buildUrl(path, options.query);
    const headers: Record<string, string> = { ...options.headers };

    if (body !== undefined) {
      headers['Content-Type'] = JSON_CONTENT_TYPE;
    }

    const raw = await this.#app.fetch(
      new Request(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    );

    return {
      status: raw.status,
      headers: raw.headers,
      body: await parseResponseBody<T>(raw),
      ok: raw.ok,
      raw,
    };
  }

  /** Make a GET request */
  get<T = unknown>(path: string, options?: RequestOptions): Promise<TestResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  /** Make a POST request */
  post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<TestResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  /** Make a PUT request */
  put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<TestResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  /** Make a PATCH request */
  patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<TestResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  /** Make a DELETE request */
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<TestResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /** Access the underlying Hono app for advanced use cases */
  get hono(): Hono {
    return this.#app;
  }
}

/**
 * Create a test app from route definitions.
 *
 * @example
 * const app = TestApp.create(healthRoutes);
 *
 * const res = await app.get('/api/health');
 * expect(res.ok).toBeTrue();
 *
 * const res = await app.post('/api/users', { name: 'John' });
 * expect(res.body.id).toBeDefined();
 */
function create(routes: RouteDefinition[]): TestAppInstance {
  return new TestAppInstance(createApp(routes));
}

export const TestApp = { create };
export type { TestAppInstance, TestResponse, RequestOptions };
