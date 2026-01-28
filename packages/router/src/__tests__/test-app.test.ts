import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { NotFound, route } from '../index';
import { TestApp } from '../testing';

describe('TestApp', () => {
  const routes = [
    route.get('/api/health', () => ({ ok: true })),
    route.get('/api/users/:id', { params: z.object({ id: z.string() }) }, ({ params }) => ({
      id: params.id,
    })),
    route.post('/api/users', { body: z.object({ name: z.string() }) }, ({ body }) => ({
      created: true,
      name: body.name,
    })),
    route.delete('/api/users/:id', { params: z.object({ id: z.string() }) }, () => ({
      deleted: true,
    })),
    route.get('/api/notfound', () => {
      throw new NotFound('Resource not found');
    }),
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
