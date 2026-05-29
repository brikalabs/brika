/**
 * Targeted tests for create-app helpers that the integration suite in
 * __tests__/router.test.ts doesn't reach:
 *
 *   - matchOrigin via the `cors` option (string allowlist, regex, function,
 *     array, '*' wildcard)
 *   - the empty-body and non-JSON branches of parseBody
 *   - the catch-all internal-server-error branch in handleError when a
 *     handler throws a plain Error
 *   - the ZodError-from-handler branch in handleError (separate from the
 *     request-schema parser path)
 */

import { describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';
import { createApp } from './create-app';
import { route } from './route';

describe('createApp CORS option', () => {
  function makeApp(corsConfig: Parameters<typeof createApp>[2] = {}) {
    return createApp(
      [route.get({ path: '/api/test', handler: () => ({ ok: true }) })],
      [],
      corsConfig
    );
  }

  test('reflects any origin when cors is undefined (default)', async () => {
    const app = makeApp();

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://anywhere.example' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://anywhere.example');
  });

  test("reflects any origin when cors is '*'", async () => {
    const app = makeApp({ cors: '*' });

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://random.example' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://random.example');
  });

  test('exact-string allowlist accepts a matching origin', async () => {
    const app = makeApp({ cors: 'http://allowed.example' });

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://allowed.example' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://allowed.example');
  });

  test('exact-string allowlist rejects a non-matching origin', async () => {
    const app = makeApp({ cors: 'http://allowed.example' });

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://attacker.example' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('regex matcher accepts matching origins', async () => {
    const app = makeApp({ cors: /^https:\/\/.*\.brika\.dev$/ });

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'https://app.brika.dev' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.brika.dev');
  });

  test('regex matcher rejects non-matching origins', async () => {
    const app = makeApp({ cors: /^https:\/\/.*\.brika\.dev$/ });

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'https://brika.dev.attacker.com' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('function matcher gates by predicate', async () => {
    const app = makeApp({
      cors: (origin) => origin.startsWith('http://internal.'),
    });

    const allowed = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://internal.example' },
      })
    );
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://internal.example');

    const rejected = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://external.example' },
      })
    );
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('array matcher combines string, regex, and function entries', async () => {
    const app = makeApp({
      cors: [
        'http://exact.example',
        /^https:\/\/.*\.brika\.dev$/,
        (origin: string) => origin === 'http://predicate.example',
      ],
    });

    const exact = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://exact.example' },
      })
    );
    expect(exact.headers.get('Access-Control-Allow-Origin')).toBe('http://exact.example');

    const rx = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'https://api.brika.dev' },
      })
    );
    expect(rx.headers.get('Access-Control-Allow-Origin')).toBe('https://api.brika.dev');

    const pred = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://predicate.example' },
      })
    );
    expect(pred.headers.get('Access-Control-Allow-Origin')).toBe('http://predicate.example');

    const blocked = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://unknown.example' },
      })
    );
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test("array matcher allows '*' wildcard entry to reflect any origin", async () => {
    const app = makeApp({ cors: ['*'] });

    const res = await app.fetch(
      new Request('http://localhost/api/test', {
        headers: { Origin: 'http://whatever.example' },
      })
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://whatever.example');
  });
});

describe('createApp request body parsing', () => {
  test('treats empty JSON body as {} so optional schemas validate', async () => {
    const app = createApp([
      route.post({
        path: '/api/empty',
        body: z.object({ name: z.string().optional() }),
        handler: ({ body }) => ({ received: body }),
      }),
    ]);

    const res = await app.fetch(
      new Request('http://localhost/api/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No body at all — text() resolves to '' and parseBody returns {}.
        body: '',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: {} });
  });

  test('ignores body when content-type is not JSON', async () => {
    const app = createApp([
      route.post({
        path: '/api/raw',
        handler: ({ body }) => ({ bodyType: typeof body, value: body ?? null }),
      }),
    ]);

    const res = await app.fetch(
      new Request('http://localhost/api/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'plain text',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bodyType: 'undefined', value: null });
  });

  test('skips body parsing on DELETE requests even with a body', async () => {
    const app = createApp([
      route.delete({
        path: '/api/resource/:id',
        params: z.object({ id: z.string() }),
        handler: ({ params, body }) => ({ id: params.id, body: body ?? null }),
      }),
    ]);

    const res = await app.fetch(
      new Request('http://localhost/api/resource/42', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shouldBeIgnored: true }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42', body: null });
  });
});

describe('createApp error fallback', () => {
  test('returns a generic 500 when the handler throws a plain Error', async () => {
    // The handleError fallback writes to console.error — silence it so the
    // test output stays clean.
    const original = console.error;
    const errorSpy = mock(() => undefined);
    console.error = errorSpy;

    try {
      const app = createApp([
        route.get({
          path: '/api/boom',
          handler: () => {
            throw new Error('kaboom');
          },
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/boom'));

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal server error' });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      console.error = original;
    }
  });

  test('returns a 400 when a handler throws a ZodError directly', async () => {
    const schema = z.object({ name: z.string() });
    const app = createApp([
      route.get({
        path: '/api/parse',
        handler: () => {
          // Force a parse failure inside the handler — exercises the
          // `error instanceof ZodError` branch of handleError without
          // running the request-schema parser.
          schema.parse({});
          return { ok: true };
        },
      }),
    ]);

    const res = await app.fetch(new Request('http://localhost/api/parse'));

    expect(res.status).toBe(400);
    const body = z
      .object({
        error: z.string(),
        fieldErrors: z.record(z.string(), z.array(z.string())),
      })
      .parse(await res.json());
    expect(body.error).toBe('Validation failed');
    expect(body.fieldErrors.name?.length).toBeGreaterThan(0);
  });
});
