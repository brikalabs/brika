import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { NotFound, route } from '../index';
import { TestApp } from '../testing';

// Individual route definitions for TestApp.call() tests
const healthRoute = route.get('/api/health', () => ({ ok: true }));
const userByIdRoute = route.get(
  '/api/users/:id',
  { params: z.object({ id: z.string() }) },
  ({ params }) => ({ id: params.id })
);
const createUserRoute = route.post(
  '/api/users',
  { body: z.object({ name: z.string() }) },
  ({ body }) => ({ created: true, name: body.name })
);
const searchRoute = route.get(
  '/api/search',
  { query: z.object({ q: z.string() }) },
  ({ query }) => ({ query: query.q })
);
const notFoundRoute = route.get('/api/notfound', () => {
  throw new NotFound('Resource not found');
});

describe('TestApp', () => {
  const routes = [
    healthRoute,
    userByIdRoute,
    createUserRoute,
    route.delete('/api/users/:id', { params: z.object({ id: z.string() }) }, () => ({
      deleted: true,
    })),
    notFoundRoute,
  ];

  test('GET request', async () => {
    const app = TestApp.create(routes);

    const res = await app.get('/api/health');

    expect(res.status).toBe(200);
    expect(res.ok).toBeTrue();
    expect(res.body).toEqual({ ok: true });
  });

  test('GET with path params', async () => {
    const app = TestApp.create(routes);

    const res = await app.get('/api/users/123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: '123' });
  });

  test('GET with query params', async () => {
    const app = TestApp.create([
      route.get('/api/search', { query: z.object({ q: z.string() }) }, ({ query }) => ({
        query: query.q,
      })),
    ]);

    const res = await app.get('/api/search', { query: { q: 'test' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ query: 'test' });
  });

  test('POST with body', async () => {
    const app = TestApp.create(routes);

    const res = await app.post('/api/users', { name: 'John' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: true, name: 'John' });
  });

  test('DELETE request', async () => {
    const app = TestApp.create(routes);

    const res = await app.delete('/api/users/123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });

  test('handles 404 error', async () => {
    const app = TestApp.create(routes);

    const res = await app.get('/api/notfound');

    expect(res.status).toBe(404);
    expect(res.ok).toBeFalse();
    expect(res.body).toEqual({ error: 'Resource not found' });
  });

  test('request() method for custom HTTP methods', async () => {
    const app = TestApp.create(routes);

    const res = await app.request('GET', '/api/health');

    expect(res.ok).toBeTrue();
    expect(res.body).toEqual({ ok: true });
  });

  test('handles validation error', async () => {
    const app = TestApp.create(routes);

    const res = await app.post('/api/users', {});

    expect(res.status).toBe(400);
  });

  test('provides access to raw response', async () => {
    const app = TestApp.create(routes);

    const res = await app.get('/api/health');

    expect(res.raw).toBeInstanceOf(Response);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('TestApp.call', () => {
  test('simple GET route with inferred types', async () => {
    const res = await TestApp.call(healthRoute);

    expect(res.status).toBe(200);
    expect(res.ok).toBeTrue();
    expect(res.body).toEqual({ ok: true });
    // TypeScript would catch if res.body.ok was accessed incorrectly
  });

  test('GET route with path params', async () => {
    const res = await TestApp.call(userByIdRoute, { params: { id: '456' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: '456' });
  });

  test('GET route with query params', async () => {
    const res = await TestApp.call(searchRoute, { query: { q: 'test-query' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ query: 'test-query' });
  });

  test('POST route with body', async () => {
    const res = await TestApp.call(createUserRoute, { body: { name: 'Alice' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: true, name: 'Alice' });
  });

  test('handles errors', async () => {
    const res = await TestApp.call(notFoundRoute);

    expect(res.status).toBe(404);
    expect(res.ok).toBeFalse();
    // Error responses have different shape than success responses
    expect((res.body as { error: string }).error).toBe('Resource not found');
  });

  test('encodes path params', async () => {
    const res = await TestApp.call(userByIdRoute, { params: { id: 'user/with/slashes' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'user/with/slashes' });
  });
});
