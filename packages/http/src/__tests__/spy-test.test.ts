import { afterEach, beforeEach, expect, test } from 'bun:test';
import { HttpClient } from '../client';

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('HttpClient uses globalThis.fetch', async () => {
  let callCount = 0;

  globalThis.fetch = (async () => {
    callCount++;
    return new Response(
      JSON.stringify({
        test: true,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }) as typeof globalThis.fetch;

  const client = new HttpClient();
  const result = await client.get('https://example.com').send();

  expect(callCount).toBeGreaterThanOrEqual(1);
  expect(result.data).toEqual({
    test: true,
  });
});
