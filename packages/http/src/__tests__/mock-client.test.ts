/**
 * Tests for MockHttpClient
 */

import { describe, expect, test } from 'bun:test';
import { createMockClient, MockHttpClient } from '../testing/mock-client';

describe('MockHttpClient', () => {
  test('createMockClient returns a MockHttpClient instance', () => {
    const client = createMockClient();
    expect(client).toBeInstanceOf(MockHttpClient);
  });

  test('records requests on execute', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/api/test', {
      status: 200,
      data: {
        result: 'ok',
      },
    });

    await client.execute({
      method: 'GET',
      url: '/api/test',
    });

    const requests = client.getRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].config.method).toBe('GET');
    expect(requests[0].config.url).toBe('/api/test');
    expect(requests[0].timestamp).toBeGreaterThan(0);
  });

  test('returns mocked response', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/api/data', {
      status: 200,
      data: {
        id: 42,
      },
    });

    const res = await client.execute({
      method: 'GET',
      url: '/api/data',
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      id: 42,
    });
  });

  test('getRequestsByMethod filters by method', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/a', {
      status: 200,
      data: null,
    });
    client.mockResponse('POST', '/b', {
      status: 201,
      data: null,
    });

    await client.execute({
      method: 'GET',
      url: '/a',
    });
    await client.execute({
      method: 'POST',
      url: '/b',
    });
    await client.execute({
      method: 'GET',
      url: '/a',
    });

    expect(client.getRequestsByMethod('GET')).toHaveLength(2);
    expect(client.getRequestsByMethod('POST')).toHaveLength(1);
  });

  test('getRequestsByUrl filters by URL using includes', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/api/users', {
      status: 200,
      data: null,
    });
    client.mockResponse('GET', '/api/posts', {
      status: 200,
      data: null,
    });

    await client.execute({
      method: 'GET',
      url: '/api/users',
    });
    await client.execute({
      method: 'GET',
      url: '/api/posts',
    });

    expect(client.getRequestsByUrl('/api/users')).toHaveLength(1);
    expect(client.getRequestsByUrl('/api')).toHaveLength(2);
  });

  test('getLastRequest returns the most recent request', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/first', {
      status: 200,
      data: null,
    });
    client.mockResponse('GET', '/second', {
      status: 200,
      data: null,
    });

    await client.execute({
      method: 'GET',
      url: '/first',
    });
    await client.execute({
      method: 'GET',
      url: '/second',
    });

    expect(client.getLastRequest()?.config.url).toBe('/second');
  });

  test('getLastRequest returns undefined when no requests', () => {
    const client = createMockClient();
    expect(client.getLastRequest()).toBeUndefined();
  });

  test('clearRequests clears recorded requests but keeps mocks', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/test', {
      status: 200,
      data: null,
    });

    await client.execute({
      method: 'GET',
      url: '/test',
    });
    expect(client.getRequests()).toHaveLength(1);

    client.clearRequests();
    expect(client.getRequests()).toHaveLength(0);

    // Mock still works after clearing requests
    const res = await client.execute({
      method: 'GET',
      url: '/test',
    });
    expect(res.status).toBe(200);
    expect(client.getRequests()).toHaveLength(1);
  });

  test('clearMocks clears mock responses', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/test', {
      status: 200,
      data: 'mocked',
    });

    const res = await client.execute({
      method: 'GET',
      url: '/test',
    });
    expect(res.data).toBe('mocked');

    client.clearMocks();
    // After clearing mocks, requests are still recorded but no mock is found
    expect(client.getRequests()).toHaveLength(1);
  });

  test('reset clears both requests and mocks', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/test', {
      status: 200,
      data: null,
    });
    await client.execute({
      method: 'GET',
      url: '/test',
    });

    client.reset();
    expect(client.getRequests()).toHaveLength(0);
  });

  test('getRequests returns a copy of the array', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/test', {
      status: 200,
      data: null,
    });
    await client.execute({
      method: 'GET',
      url: '/test',
    });

    const requests1 = client.getRequests();
    const requests2 = client.getRequests();
    expect(requests1).not.toBe(requests2);
    expect(requests1).toEqual(requests2);
  });

  test('records config as a shallow copy', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/test', {
      status: 200,
      data: null,
    });

    const config = {
      method: 'GET' as const,
      url: '/test',
      headers: {
        'x-custom': 'value',
      },
    };
    await client.execute(config);

    const recorded = client.getLastRequest();
    expect(recorded?.config).toEqual(config);
    expect(recorded?.config).not.toBe(config);
  });

  test('multiple mocks for different method+url combos', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/api/items', {
      status: 200,
      data: [
        1,
        2,
        3,
      ],
    });
    client.mockResponse('POST', '/api/items', {
      status: 201,
      data: {
        id: 4,
      },
    });
    client.mockResponse('DELETE', '/api/items/1', {
      status: 204,
      data: null,
    });

    const getRes = await client.execute({
      method: 'GET',
      url: '/api/items',
    });
    expect(getRes.status).toBe(200);
    expect(getRes.data).toEqual([
      1,
      2,
      3,
    ]);

    const postRes = await client.execute({
      method: 'POST',
      url: '/api/items',
    });
    expect(postRes.status).toBe(201);
    expect(postRes.data).toEqual({
      id: 4,
    });

    const deleteRes = await client.execute({
      method: 'DELETE',
      url: '/api/items/1',
    });
    expect(deleteRes.status).toBe(204);

    expect(client.getRequests()).toHaveLength(3);
  });

  test('mockResponse overwrites previous mock for same method+url', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/api/data', {
      status: 200,
      data: 'first',
    });
    client.mockResponse('GET', '/api/data', {
      status: 200,
      data: 'second',
    });

    const res = await client.execute({
      method: 'GET',
      url: '/api/data',
    });
    expect(res.data).toBe('second');
  });

  test('getRequestsByMethod returns empty array when no matches', () => {
    const client = createMockClient();
    expect(client.getRequestsByMethod('POST')).toHaveLength(0);
  });

  test('getRequestsByUrl returns empty array when no matches', () => {
    const client = createMockClient();
    expect(client.getRequestsByUrl('/nonexistent')).toHaveLength(0);
  });

  test('timestamp reflects execution time', async () => {
    const client = createMockClient();
    client.mockResponse('GET', '/test', {
      status: 200,
      data: null,
    });

    const before = Date.now();
    await client.execute({
      method: 'GET',
      url: '/test',
    });
    const after = Date.now();

    const recorded = client.getLastRequest();
    expect(recorded?.timestamp).toBeGreaterThanOrEqual(before);
    expect(recorded?.timestamp).toBeLessThanOrEqual(after);
  });
});
