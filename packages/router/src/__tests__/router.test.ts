import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { BadRequest, combineRoutes, createApp, group, NotFound, route } from '../index';

describe('@brika/router', () => {
  describe('route', () => {
    it('should create a GET route without schema', () => {
      const r = route.get('/test', async () => ({ ok: true }));

      expect(r.method).toBe('GET');
      expect(r.path).toBe('/test');
      expect(r.schema).toBeUndefined();
    });

    it('should create a GET route with schema', () => {
      const r = route.get(
        '/test/:id',
        { params: z.object({ id: z.string() }) },
        async ({ params }) => ({
          id: params.id,
        })
      );

      expect(r.method).toBe('GET');
      expect(r.path).toBe('/test/:id');
      expect(r.schema).toBeDefined();
      expect(r.schema?.params).toBeDefined();
    });

    it('should create POST route with body schema', () => {
      const r = route.post('/test', { body: z.object({ name: z.string() }) }, async ({ body }) => ({
        name: body.name,
      }));

      expect(r.method).toBe('POST');
      expect(r.schema?.body).toBeDefined();
    });

    it('should create DELETE route', () => {
      const r = route.delete('/test/:id', async () => ({ ok: true }));

      expect(r.method).toBe('DELETE');
    });
  });

  describe('group', () => {
    it('should prefix all routes', () => {
      const routes = group('/api/users', [
        route.get('/', async () => []),
        route.get('/:id', async () => ({})),
        route.post('/', async () => ({})),
      ]);

      expect(routes[0]?.path).toBe('/api/users');
      expect(routes[1]?.path).toBe('/api/users/:id');
      expect(routes[2]?.path).toBe('/api/users');
    });

    it('should handle prefix without leading slash', () => {
      const routes = group('api', [route.get('/test', async () => ({}))]);

      expect(routes[0]?.path).toBe('/api/test');
    });

    it('should handle prefix with trailing slash', () => {
      const routes = group('/api/', [route.get('/test', async () => ({}))]);

      expect(routes[0]?.path).toBe('/api/test');
    });
  });

  describe('combineRoutes', () => {
    it('should combine multiple route arrays', () => {
      const usersRoutes = [route.get('/users', async () => [])];
      const postsRoutes = [route.get('/posts', async () => [])];

      const combined = combineRoutes(usersRoutes, postsRoutes);

      expect(combined).toHaveLength(2);
      expect(combined[0]?.path).toBe('/users');
      expect(combined[1]?.path).toBe('/posts');
    });

    it('should apply prefix when provided', () => {
      const usersRoutes = [route.get('/users', async () => [])];
      const postsRoutes = [route.get('/posts', async () => [])];

      const combined = combineRoutes({ prefix: '/api/v1' }, usersRoutes, postsRoutes);

      expect(combined).toHaveLength(2);
      expect(combined[0]?.path).toBe('/api/v1/users');
      expect(combined[1]?.path).toBe('/api/v1/posts');
    });

    it('should work with grouped routes', () => {
      const usersRoutes = group('/users', [
        route.get('/', async () => []),
        route.get('/:id', async () => ({})),
      ]);
      const postsRoutes = group('/posts', [route.get('/', async () => [])]);

      const combined = combineRoutes({ prefix: '/api' }, usersRoutes, postsRoutes);

      expect(combined).toHaveLength(3);
      expect(combined[0]?.path).toBe('/api/users');
      expect(combined[1]?.path).toBe('/api/users/:id');
      expect(combined[2]?.path).toBe('/api/posts');
    });

    it('should handle empty arrays', () => {
      const combined = combineRoutes([], [], [route.get('/test', async () => ({}))]);

      expect(combined).toHaveLength(1);
    });

    it('should work without prefix option', () => {
      const routes = combineRoutes(
        [route.get('/a', async () => ({}))],
        [route.get('/b', async () => ({}))]
      );

      expect(routes).toHaveLength(2);
      expect(routes[0]?.path).toBe('/a');
      expect(routes[1]?.path).toBe('/b');
    });
  });

  describe('createApp', () => {
    it('should create a Hono app', () => {
      const app = createApp([route.get('/test', async () => ({ ok: true }))]);

      expect(app).toBeDefined();
      expect(typeof app.fetch).toBe('function');
    });

    it('should handle GET requests', async () => {
      const app = createApp([route.get('/api/health', async () => ({ status: 'ok' }))]);

      const res = await app.fetch(new Request('http://localhost/api/health'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: 'ok' });
    });

    it('should validate body with Zod schema', async () => {
      const app = createApp([
        route.post(
          '/api/users',
          { body: z.object({ name: z.string(), age: z.number() }) },
          async ({ body }) => ({ created: body.name })
        ),
      ]);

      // Valid request
      const validRes = await app.fetch(
        new Request('http://localhost/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'John', age: 30 }),
        })
      );
      expect(validRes.status).toBe(200);
      expect(await validRes.json()).toEqual({ created: 'John' });

      // Invalid request - missing field
      const invalidRes = await app.fetch(
        new Request('http://localhost/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'John' }),
        })
      );
      expect(invalidRes.status).toBe(400);
      const errorBody = await invalidRes.json();
      // Zod 4's flattenError returns { error, formErrors, fieldErrors }
      expect(errorBody.error).toBe('Validation failed');
      expect(errorBody.fieldErrors.age).toBeDefined();
      expect(errorBody.fieldErrors.age.length).toBeGreaterThan(0);
    });

    it('should validate query params', async () => {
      const app = createApp([
        route.get(
          '/api/search',
          { query: z.object({ q: z.string(), limit: z.string().optional() }) },
          async ({ query }) => ({ query: query.q })
        ),
      ]);

      // Valid request
      const validRes = await app.fetch(new Request('http://localhost/api/search?q=test'));
      expect(validRes.status).toBe(200);
      expect(await validRes.json()).toEqual({ query: 'test' });

      // Invalid request - missing required query param
      const invalidRes = await app.fetch(new Request('http://localhost/api/search'));
      expect(invalidRes.status).toBe(400);
    });

    it('should handle path params', async () => {
      const app = createApp([
        route.get(
          '/api/users/:id',
          { params: z.object({ id: z.string() }) },
          async ({ params }) => ({
            userId: params.id,
          })
        ),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/users/123'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ userId: '123' });
    });

    it('should handle HttpException', async () => {
      const app = createApp([
        route.get('/api/user/:id', ({ params }) => {
          const p = params as { id: string };
          if (p.id === '404') {
            throw new NotFound('User not found');
          }
          return { id: p.id };
        }),
      ]);

      const notFoundRes = await app.fetch(new Request('http://localhost/api/user/404'));
      expect(notFoundRes.status).toBe(404);
      expect(await notFoundRes.json()).toEqual({ error: 'User not found' });

      const okRes = await app.fetch(new Request('http://localhost/api/user/123'));
      expect(okRes.status).toBe(200);
    });

    it('should handle BadRequest exception', async () => {
      const app = createApp([
        route.post('/api/validate', () => {
          throw new BadRequest('Invalid data');
        }),
      ]);

      const res = await app.fetch(
        new Request('http://localhost/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid data' });
    });

    it('should return raw Response when handler returns Response', async () => {
      const app = createApp([
        route.get('/api/stream', () => {
          return new Response('raw data', {
            headers: { 'Content-Type': 'text/plain' },
          });
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/stream'));
      expect(res.headers.get('Content-Type')).toBe('text/plain');
      expect(await res.text()).toBe('raw data');
    });

    it('should add CORS headers', async () => {
      const app = createApp([route.get('/api/test', async () => ({ ok: true }))]);

      const res = await app.fetch(new Request('http://localhost/api/test'));
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
