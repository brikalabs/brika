/**
 * Tests for MockFetch
 */

import { describe, expect, test } from 'bun:test';
import { createMockFetch, MockFetch } from '../testing/mock-fetch';

describe('MockFetch', () => {
  test('createMockFetch returns a MockFetch instance', () => {
    const mock = createMockFetch();
    expect(mock).toBeInstanceOf(MockFetch);
  });

  test('mock() returns this for chaining', () => {
    const mock = createMockFetch();
    const result = mock.mock(
      {
        method: 'GET',
        url: '/test',
      },
      {
        status: 200,
      }
    );
    expect(result).toBe(mock);
  });

  test('fallback() returns this for chaining', () => {
    const mock = createMockFetch();
    const result = mock.fallback({
      status: 404,
    });
    expect(result).toBe(mock);
  });

  test('getFetchFn returns matched mock response', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        method: 'GET',
        url: '/api/users',
      },
      {
        status: 200,
        data: {
          id: 1,
        },
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/api/users');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: 1,
    });
  });

  test('getFetchFn throws when no mock matches and no fallback', async () => {
    const mock = createMockFetch();
    const fetchFn = mock.getFetchFn();
    expect(fetchFn('/unknown')).rejects.toThrow('No mock found');
  });

  test('getFetchFn uses fallback response for unmatched requests', async () => {
    const mock = createMockFetch();
    mock.fallback({
      status: 404,
      data: 'not found',
    });
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/anything');
    expect(res.status).toBe(404);
  });

  test('matches by method', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        method: 'POST',
        url: '/api',
      },
      {
        status: 201,
      }
    );
    mock.mock(
      {
        method: 'GET',
        url: '/api',
      },
      {
        status: 200,
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/api', {
      method: 'POST',
    });
    expect(res.status).toBe(201);
  });

  test('matches by regex URL', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: /\/api\/users\/\d+/,
      },
      {
        status: 200,
        data: {
          name: 'test',
        },
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/api/users/42');
    expect(res.status).toBe(200);
  });

  test('handles URL input types', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: 'example.com',
      },
      {
        status: 200,
      }
    );
    const fetchFn = mock.getFetchFn();

    // URL object
    const res1 = await fetchFn(new URL('https://example.com/path'));
    expect(res1.status).toBe(200);

    // Request object
    const res2 = await fetchFn(new Request('https://example.com/path'));
    expect(res2.status).toBe(200);
  });

  test('applies delay', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/slow',
      },
      {
        status: 200,
        delay: 10,
      }
    );
    const fetchFn = mock.getFetchFn();
    const start = Date.now();
    await fetchFn('/slow');
    expect(Date.now() - start).toBeGreaterThanOrEqual(9);
  });

  test('handles string data', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/text',
      },
      {
        data: 'hello world',
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/text');
    expect(await res.text()).toBe('hello world');
  });

  test('handles undefined data as empty body', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/empty',
      },
      {
        status: 204,
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/empty');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  test('auto-sets content-type for JSON data', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/json',
      },
      {
        data: {
          key: 'value',
        },
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/json');
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('does not override explicit content-type header', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/custom',
      },
      {
        data: {
          x: 1,
        },
        headers: {
          'content-type': 'text/plain',
        },
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/custom');
    expect(res.headers.get('content-type')).toBe('text/plain');
  });

  test('defaults to status 200 and statusText OK', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/default',
      },
      {}
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/default');
    expect(res.status).toBe(200);
    expect(res.statusText).toBe('OK');
  });

  test('clear removes all mocks and fallback', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/test',
      },
      {
        status: 200,
      }
    );
    mock.fallback({
      status: 404,
    });
    mock.clear();
    const fetchFn = mock.getFetchFn();
    expect(fetchFn('/test')).rejects.toThrow('No mock found');
  });

  test('default method is GET when no init provided', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        method: 'GET',
        url: '/api',
      },
      {
        status: 200,
        data: 'get-response',
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/api');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('get-response');
  });

  test('matcher without method matches any method', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/api',
      },
      {
        status: 200,
      }
    );
    const fetchFn = mock.getFetchFn();

    const getRes = await fetchFn('/api');
    expect(getRes.status).toBe(200);

    const postRes = await fetchFn('/api', {
      method: 'POST',
    });
    expect(postRes.status).toBe(200);

    const deleteRes = await fetchFn('/api', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
  });

  test('matcher without url matches any url', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        method: 'GET',
      },
      {
        status: 200,
      }
    );
    const fetchFn = mock.getFetchFn();

    const res1 = await fetchFn('/any-path');
    expect(res1.status).toBe(200);

    const res2 = await fetchFn('/completely/different');
    expect(res2.status).toBe(200);
  });

  test('string url matching uses includes', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/api/users',
      },
      {
        status: 200,
        data: [],
      }
    );
    const fetchFn = mock.getFetchFn();

    // Partial match should work
    const res = await fetchFn('https://example.com/api/users?page=1');
    expect(res.status).toBe(200);
  });

  test('returns first matching mock', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/api',
      },
      {
        status: 200,
        data: 'first',
      }
    );
    mock.mock(
      {
        url: '/api',
      },
      {
        status: 201,
        data: 'second',
      }
    );
    const fetchFn = mock.getFetchFn();

    const res = await fetchFn('/api');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('first');
  });

  test('custom headers are included in response', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/api',
      },
      {
        status: 200,
        headers: {
          'x-custom': 'value',
          'x-request-id': '123',
        },
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/api');
    expect(res.headers.get('x-custom')).toBe('value');
    expect(res.headers.get('x-request-id')).toBe('123');
  });

  test('custom statusText is used', async () => {
    const mock = createMockFetch();
    mock.mock(
      {
        url: '/api',
      },
      {
        status: 201,
        statusText: 'Created',
      }
    );
    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/api');
    expect(res.status).toBe(201);
    expect(res.statusText).toBe('Created');
  });

  test('chaining mock and fallback', async () => {
    const mock = createMockFetch();
    mock
      .mock(
        {
          method: 'GET',
          url: '/api/users',
        },
        {
          status: 200,
          data: [
            {
              id: 1,
            },
          ],
        }
      )
      .mock(
        {
          method: 'POST',
          url: '/api/users',
        },
        {
          status: 201,
          data: {
            id: 2,
          },
        }
      )
      .fallback({
        status: 404,
        data: {
          error: 'Not Found',
        },
      });

    const fetchFn = mock.getFetchFn();

    const getRes = await fetchFn('/api/users');
    expect(getRes.status).toBe(200);

    const postRes = await fetchFn('/api/users', {
      method: 'POST',
    });
    expect(postRes.status).toBe(201);

    const unknownRes = await fetchFn('/api/unknown');
    expect(unknownRes.status).toBe(404);
  });

  test('fallback response supports all MockResponse fields', async () => {
    const mock = createMockFetch();
    mock.fallback({
      status: 500,
      statusText: 'Internal Server Error',
      headers: {
        'x-error': 'true',
      },
      data: {
        error: 'server error',
      },
    });

    const fetchFn = mock.getFetchFn();
    const res = await fetchFn('/any');
    expect(res.status).toBe(500);
    expect(res.statusText).toBe('Internal Server Error');
    expect(res.headers.get('x-error')).toBe('true');
    expect(await res.json()).toEqual({
      error: 'server error',
    });
  });
});
