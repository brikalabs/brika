import { afterEach, expect, test } from 'bun:test';
import { realFetch } from '@brika/testing';
import { HttpClient } from '../client';

// Restore to the TRUE original fetch from @brika/testing rather than
// a per-test capture of globalThis.fetch — under cross-file parallel
// `bun test` the per-test capture can grab another file's spy.
afterEach(() => {
  globalThis.fetch = realFetch;
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
