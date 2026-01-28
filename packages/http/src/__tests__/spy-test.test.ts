import { expect, spyOn, test } from 'bun:test';
import { HttpClient } from '../client';

test('HttpClient uses spied fetch', async () => {
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
