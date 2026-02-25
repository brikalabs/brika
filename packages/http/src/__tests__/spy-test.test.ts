import { expect, spyOn, test } from 'bun:test';
import { HttpClient } from '../client';

// Skipped on CI: globalThis.fetch can be contaminated by mock.module bleed
// from other test files running in the same Bun process (Bun #12823).
test.skipIf(!!process.env.CI)('HttpClient uses spied fetch', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch');
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ test: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );

  const client = new HttpClient();
  const result = await client.get('https://example.com').send();

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(result.data).toEqual({ test: true });

  fetchSpy.mockRestore();
});
