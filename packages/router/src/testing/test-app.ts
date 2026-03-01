/**
 * TestApp - Router Testing Utility
 *
 * Provides a fluent API for testing routes without starting a real server.
 * Uses Hono's in-memory request handling for fast, isolated tests.
 *
 * @example
 * // Traditional approach - create app with multiple routes
 * const app = TestApp.create(healthRoutes);
 * const res = await app.get('/api/health');
 *
 * // New approach - test a single route directly with type inference
 * const healthRoute = route.get('/api/health', () => ({ ok: true }));
 * const res = await TestApp.call(healthRoute);
 * // res.body is typed as { ok: boolean }
 */

import type { Hono } from 'hono';
import { createApp } from '../create-app';
import type { HttpMethod, Middleware, RouteDefinition, RouteInput, Schema } from '../types';

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

/**
 * Substitute path parameters in a URL pattern.
 * e.g., "/users/:id" with { id: "123" } becomes "/users/123"
 */
function substitutePath(pattern: string, params?: Record<string, string>): string {
  if (!params) {
    return pattern;
  }
  return pattern.replaceAll(/:(\w+)/g, (_, key) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(value);
  });
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

async function makeRequest<T>(
  app: Hono,
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<TestResponse<T>> {
  const url = buildUrl(path, options.query);
  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (body !== undefined) {
    headers['Content-Type'] = JSON_CONTENT_TYPE;
  }

  const raw = await app.fetch(
    new Request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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

class TestAppInstance {
  readonly #app: Hono;

  constructor(app: Hono) {
    this.#app = app;
  }

  /**
   * Make an HTTP request with the given method.
   */
  request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<TestResponse<T>> {
    return makeRequest<T>(this.#app, method, path, body, options);
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
function create(routes: RouteDefinition[], middleware?: Middleware[]): TestAppInstance {
  return new TestAppInstance(createApp(routes, middleware));
}

/**
 * Test a single route directly with full type inference.
 * Method, path, and return type are inferred from the route definition.
 *
 * @example
 * // Simple route - no input needed
 * const healthRoute = route.get('/api/health', () => ({ ok: true }));
 * const res = await TestApp.call(healthRoute);
 * // res.body is typed as { ok: boolean }
 *
 * // Route with path params
 * const userRoute = route.get('/api/users/:id',
 *   { params: z.object({ id: z.string() }) },
 *   ({ params }) => ({ id: params.id })
 * );
 * const res = await TestApp.call(userRoute, { params: { id: '123' } });
 * // res.body is typed as { id: string }
 *
 * // Route with body
 * const createRoute = route.post('/api/users',
 *   { body: z.object({ name: z.string() }) },
 *   ({ body }) => ({ created: true, name: body.name })
 * );
 * const res = await TestApp.call(createRoute, { body: { name: 'John' } });
 */
function call<S extends Schema, R>(
  route: RouteDefinition<S, R>,
  input?: RouteInput<S>
): Promise<TestResponse<R>> {
  const app = createApp([route]);
  const path = substitutePath(route.path, input?.params as Record<string, string> | undefined);

  return makeRequest<R>(app, route.method, path, input?.body, {
    headers: input?.headers,
    query: input?.query as Record<string, string> | undefined,
  });
}

export const TestApp = {
  create,
  call,
};
export type { TestAppInstance, TestResponse, RequestOptions };
