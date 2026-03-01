/**
 * Tests for the Routes context module.
 *
 * Tests setupRoutes() directly by providing a mock ContextCore.
 * No mock.module needed — we just call the function and inspect results.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupRoutes } from '../../context/routes';
import { createTestHarness, type Handler } from './_test-utils';

// ─── Test harness ────────────────────────────────────────────────────────────

const h = createTestHarness();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('setupRoutes', () => {
  let methods: ReturnType<typeof setupRoutes>['methods'];
  let routeRequest: Handler;

  beforeEach(() => {
    h.reset();

    const result = setupRoutes(h.core);
    methods = result.methods;
    routeRequest = h.implHandlers.get('routeRequest') ?? (() => undefined);
  });

  test('registerRoute sends IPC with method and path', () => {
    methods.registerRoute('GET', '/api/status', () => {
      return {
        status: 200,
      };
    });

    expect(h.client.send).toHaveBeenCalledTimes(1);
    const [def, payload] = (h.client.send.mock.calls[0] ?? []) as [
      {
        name: string;
      },
      unknown,
    ];
    expect(def.name).toBe('registerRoute');
    expect(payload).toEqual({
      method: 'GET',
      path: '/api/status',
    });
  });

  test('routeRequest calls registered handler with correct args', async () => {
    const handler = mock(
      async (req: {
        method: string;
        path: string;
        query: Record<string, string>;
        headers: Record<string, string>;
        body?: unknown;
      }) => ({
        status: 200,
        body: {
          received: req.method,
        },
      })
    );

    methods.registerRoute('POST', '/api/data', handler);

    const result = await routeRequest({
      routeId: 'POST:/api/data',
      method: 'POST',
      path: '/api/data',
      query: {
        page: '1',
      },
      headers: {
        'content-type': 'application/json',
      },
      body: {
        key: 'value',
      },
    });

    expect(result).toEqual({
      status: 200,
      body: {
        received: 'POST',
      },
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/data',
      query: {
        page: '1',
      },
      headers: {
        'content-type': 'application/json',
      },
      body: {
        key: 'value',
      },
    });
  });

  test('routeRequest returns 404 for unregistered route', async () => {
    const result = await routeRequest({
      routeId: 'GET:/unknown',
      method: 'GET',
      path: '/unknown',
      query: {},
      headers: {},
    });

    expect(result).toEqual({
      status: 404,
      body: {
        error: 'Route handler not found',
      },
    });
  });

  test('routeRequest returns 500 on handler error', async () => {
    methods.registerRoute('GET', '/api/crash', () => {
      throw new Error('handler crashed');
    });

    const result = await routeRequest({
      routeId: 'GET:/api/crash',
      method: 'GET',
      path: '/api/crash',
      query: {},
      headers: {},
    });

    expect(result).toEqual({
      status: 500,
      body: {
        error: 'Error: handler crashed',
      },
    });
  });

  test('multiple routes can coexist', async () => {
    const getHandler = mock(() => {
      return {
        status: 200,
        body: {
          action: 'get',
        },
      };
    });
    const postHandler = mock(() => {
      return {
        status: 201,
        body: {
          action: 'post',
        },
      };
    });
    const deleteHandler = mock(() => {
      return {
        status: 204,
      };
    });

    methods.registerRoute('GET', '/api/items', getHandler);
    methods.registerRoute('POST', '/api/items', postHandler);
    methods.registerRoute('DELETE', '/api/items/:id', deleteHandler);

    // All three should have sent IPC registration messages
    expect(h.client.send).toHaveBeenCalledTimes(3);

    const getResult = await routeRequest({
      routeId: 'GET:/api/items',
      method: 'GET',
      path: '/api/items',
      query: {},
      headers: {},
    });
    expect(getResult).toEqual({
      status: 200,
      body: {
        action: 'get',
      },
    });
    expect(getHandler).toHaveBeenCalledTimes(1);

    const postResult = await routeRequest({
      routeId: 'POST:/api/items',
      method: 'POST',
      path: '/api/items',
      query: {},
      headers: {
        'content-type': 'application/json',
      },
      body: {
        name: 'widget',
      },
    });
    expect(postResult).toEqual({
      status: 201,
      body: {
        action: 'post',
      },
    });
    expect(postHandler).toHaveBeenCalledTimes(1);

    const deleteResult = await routeRequest({
      routeId: 'DELETE:/api/items/:id',
      method: 'DELETE',
      path: '/api/items/:id',
      query: {},
      headers: {},
    });
    expect(deleteResult).toEqual({
      status: 204,
    });
    expect(deleteHandler).toHaveBeenCalledTimes(1);
  });
});
