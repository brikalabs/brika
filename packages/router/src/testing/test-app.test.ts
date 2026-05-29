/**
 * Coverage for the TestApp surfaces that the suite in
 * `__tests__/test-app.test.ts` doesn't reach:
 *
 *   - the `hono` getter that exposes the underlying Hono instance
 *   - middleware forwarding through `TestApp.create`
 *   - the text-body branch of `parseResponseBody` (non-JSON content type)
 *   - the missing-path-param guard in `substitutePath`
 *
 * Per TESTING.md these live colocated with the source rather than under
 * `__tests__/`.
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { route } from '../route';
import type { Middleware } from '../types';
import { TestApp } from './test-app';

describe('TestApp.create hono accessor', () => {
  test('exposes the underlying Hono instance for direct fetch', async () => {
    const app = TestApp.create([route.get({ path: '/api/ping', handler: () => ({ pong: true }) })]);

    // The getter is the only path that lets a caller bypass TestAppInstance
    // for direct Hono.fetch use — drives line 170.
    const direct = await app.hono.fetch(new Request('http://test/api/ping'));
    expect(direct.status).toBe(200);
    expect(await direct.json()).toEqual({ pong: true });
  });

  test('forwards extra middleware to the underlying app', async () => {
    const tagged: string[] = [];
    const mw: Middleware = async (_c, next) => {
      tagged.push('mw');
      await next();
    };
    const app = TestApp.create(
      [route.get({ path: '/api/tagged', handler: () => ({ ok: true }) })],
      [mw]
    );

    const res = await app.get('/api/tagged');
    expect(res.status).toBe(200);
    expect(tagged).toEqual(['mw']);
  });
});

describe('TestApp response body parsing', () => {
  test('returns text body when the route returns a non-JSON Response', async () => {
    // makeRequest's parseResponseBody chooses text() when content-type
    // doesn't include application/json — the only path that exercises it.
    const textRoute = route.get({
      path: '/api/raw',
      handler: () =>
        new Response('hello world', {
          headers: { 'Content-Type': 'text/plain' },
        }),
    });

    const app = TestApp.create([textRoute]);
    const res = await app.get<string>('/api/raw');

    expect(res.status).toBe(200);
    expect(res.body).toBe('hello world');
    expect(res.headers.get('content-type')).toContain('text/plain');
  });
});

describe('TestApp.call path-param guard', () => {
  test('throws when a declared placeholder is missing from params', async () => {
    // Declare with z.record() so the input type accepts a partial params
    // record without `as` gymnastics — the runtime check in
    // substitutePath is the thing under test, not the schema.
    const twoParamRoute = route.get({
      path: '/api/orgs/:orgId/users/:userId',
      params: z.record(z.string(), z.string()),
      handler: ({ params }) => params,
    });

    let caughtMessage: string | undefined;
    try {
      await TestApp.call(twoParamRoute, { params: { orgId: 'acme' } });
    } catch (error) {
      if (error instanceof Error) {
        caughtMessage = error.message;
      }
    }

    expect(caughtMessage).toBe('Missing path parameter: userId');
  });
});
