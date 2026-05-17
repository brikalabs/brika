/** Unit tests for the workflows HTTP client. */
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { fetchWorkflows } from './workflows';

describe('fetchWorkflows', () => {
  const bun = useBunMock();

  test('returns workflows from the wrapped response shape', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            workflows: [{ id: 'w1', name: 'one', enabled: true, state: 'idle' }],
          }),
          { status: 200 }
        )
    );
    const result = await fetchWorkflows();
    expect(result).toEqual([{ id: 'w1', name: 'one', enabled: true, state: 'idle' }]);
  });

  test('accepts a plain array body', async () => {
    bun.fetch(
      async () => new Response(JSON.stringify([{ id: 'w1' }, { id: 'w2' }]), { status: 200 })
    );
    const result = await fetchWorkflows();
    expect(result).toHaveLength(2);
  });

  test('returns an empty list when workflows is missing', async () => {
    bun.fetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect(await fetchWorkflows()).toEqual([]);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('boom', { status: 502 }));
    expect(fetchWorkflows()).rejects.toThrow(/502/);
  });
});
