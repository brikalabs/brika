/** Unit tests for the users HTTP client. */
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { fetchUsers } from './users';

describe('fetchUsers', () => {
  const bun = useBunMock();

  test('returns users from the wrapped response shape', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            users: [{ id: 'u1', email: 'a@b.c', name: 'a', role: 'admin' }],
          }),
          { status: 200 }
        )
    );
    const result = await fetchUsers();
    expect(result).toEqual([{ id: 'u1', email: 'a@b.c', name: 'a', role: 'admin' }]);
  });

  test('accepts a plain array body', async () => {
    bun.fetch(
      async () =>
        new Response(JSON.stringify([{ id: 'u1', email: 'a@b.c', name: 'a', role: 'admin' }]), {
          status: 200,
        })
    );
    const result = await fetchUsers();
    expect(result).toHaveLength(1);
  });

  test('returns an empty list when users is missing', async () => {
    bun.fetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect(await fetchUsers()).toEqual([]);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('nope', { status: 401 }));
    expect(fetchUsers()).rejects.toThrow(/401/);
  });
});
