import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import type { Middleware } from '../index';
import { BadRequest, combineRoutes, createApp, group, NotFound, route } from '../index';

describe('@brika/router', () => {
  describe('route', () => {
    it('should create a GET route without schema', () => {
      const r = route.get({
        path: '/test',
        handler: async () => ({
          ok: true,
        }),
      });

      expect(r.method).toBe('GET');
      expect(r.path).toBe('/test');
      expect(r.schema).toBeUndefined();
    });

    it('should create a GET route with schema', () => {
      const r = route.get({
        path: '/test/:id',
        params: z.object({
          id: z.string(),
        }),
        handler: async ({ params }) => ({
          id: params.id,
        }),
      });

      expect(r.method).toBe('GET');
      expect(r.path).toBe('/test/:id');
      expect(r.schema).toBeDefined();
      expect(r.schema?.params).toBeDefined();
    });

    it('should create POST route with body schema', () => {
      const r = route.post({
        path: '/test',
        body: z.object({
          name: z.string(),
        }),
        handler: async ({ body }) => ({
          name: body.name,
        }),
      });

      expect(r.method).toBe('POST');
      expect(r.schema?.body).toBeDefined();
    });

    it('should create DELETE route', () => {
      const r = route.delete({
        path: '/test/:id',
        handler: async () => ({
          ok: true,
        }),
      });

      expect(r.method).toBe('DELETE');
    });

    it('should create PUT route without schema', () => {
      const r = route.put({
        path: '/test/:id',
        handler: async () => ({
          updated: true,
        }),
      });

      expect(r.method).toBe('PUT');
      expect(r.path).toBe('/test/:id');
      expect(r.schema).toBeUndefined();
    });

    it('should create PUT route with schema', () => {
      const r = route.put({
        path: '/test/:id',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          name: z.string(),
        }),
        handler: async ({ params, body }) => ({
          id: params.id,
          name: body.name,
        }),
      });

      expect(r.method).toBe('PUT');
      expect(r.schema?.params).toBeDefined();
      expect(r.schema?.body).toBeDefined();
    });

    it('should create PATCH route without schema', () => {
      const r = route.patch({
        path: '/test/:id',
        handler: async () => ({
          patched: true,
        }),
      });

      expect(r.method).toBe('PATCH');
      expect(r.path).toBe('/test/:id');
      expect(r.schema).toBeUndefined();
    });

    it('should create PATCH route with schema', () => {
      const r = route.patch({
        path: '/test/:id',
        params: z.object({
          id: z.string(),
        }),
        body: z.object({
          name: z.string().optional(),
        }),
        handler: async ({ params, body }) => ({
          id: params.id,
          name: body.name,
        }),
      });

      expect(r.method).toBe('PATCH');
      expect(r.schema?.params).toBeDefined();
      expect(r.schema?.body).toBeDefined();
    });

    it('should create a route with middleware only', () => {
      const mw: Middleware = async (_c, next) => {
        await next();
      };
      const r = route.get({
        path: '/test',
        middleware: [mw],
        handler: async () => ({
          ok: true,
        }),
      });

      expect(r.method).toBe('GET');
      expect(r.middleware).toHaveLength(1);
      expect(r.middleware?.[0]).toBe(mw);
      expect(r.schema?.params).toBeUndefined();
    });

    it('should create a route with schema and middleware', () => {
      const mw: Middleware = async (_c, next) => {
        await next();
      };
      const r = route.post({
        path: '/test',
        body: z.object({
          name: z.string(),
        }),
        middleware: [mw],
        handler: async ({ body }) => ({
          name: body.name,
        }),
      });

      expect(r.method).toBe('POST');
      expect(r.schema?.body).toBeDefined();
      expect(r.middleware).toHaveLength(1);
    });

    it('should not have middleware when none provided', () => {
      const r = route.get({
        path: '/test',
        handler: async () => ({
          ok: true,
        }),
      });
      expect(r.middleware).toBeUndefined();
    });
  });

  describe('group', () => {
    it('should prefix all routes', () => {
      const routes = group({
        prefix: '/api/users',
        routes: [
          route.get({
            path: '/',
            handler: async () => [],
          }),
          route.get({
            path: '/:id',
            handler: async () => ({}),
          }),
          route.post({
            path: '/',
            handler: async () => ({}),
          }),
        ],
      });

      expect(routes[0]?.path).toBe('/api/users');
      expect(routes[1]?.path).toBe('/api/users/:id');
      expect(routes[2]?.path).toBe('/api/users');
    });

    it('should handle prefix without leading slash', () => {
      const routes = group({
        prefix: 'api',
        routes: [
          route.get({
            path: '/test',
            handler: async () => ({}),
          }),
        ],
      });

      expect(routes[0]?.path).toBe('/api/test');
    });

    it('should handle prefix with trailing slash', () => {
      const routes = group({
        prefix: '/api/',
        routes: [
          route.get({
            path: '/test',
            handler: async () => ({}),
          }),
        ],
      });

      expect(routes[0]?.path).toBe('/api/test');
    });

    it('should apply group middleware to all routes', () => {
      const mw: Middleware = async (_c, next) => {
        await next();
      };
      const routes = group({
        prefix: '/api/users',
        middleware: [mw],
        routes: [
          route.get({
            path: '/',
            handler: async () => [],
          }),
          route.get({
            path: '/:id',
            handler: async () => ({}),
          }),
        ],
      });

      expect(routes).toHaveLength(2);
      expect(routes[0]?.middleware).toHaveLength(1);
      expect(routes[0]?.middleware?.[0]).toBe(mw);
      expect(routes[1]?.middleware).toHaveLength(1);
    });

    it('should prepend group middleware before route middleware', () => {
      const groupMw: Middleware = async (_c, next) => {
        await next();
      };
      const routeMw: Middleware = async (_c, next) => {
        await next();
      };
      const routes = group({
        prefix: '/api',
        middleware: [groupMw],
        routes: [
          route.get({
            path: '/test',
            middleware: [routeMw],
            handler: async () => ({}),
          }),
        ],
      });

      expect(routes[0]?.middleware).toHaveLength(2);
      expect(routes[0]?.middleware?.[0]).toBe(groupMw);
      expect(routes[0]?.middleware?.[1]).toBe(routeMw);
    });

    it('should not add middleware when none provided', () => {
      const routes = group({
        prefix: '/api/users',
        routes: [
          route.get({
            path: '/',
            handler: async () => [],
          }),
        ],
      });

      expect(routes[0]?.middleware).toBeUndefined();
    });

    it('should apply middleware without prefix', () => {
      const mw: Middleware = async (_c, next) => {
        await next();
      };
      const routes = group({
        middleware: [mw],
        routes: [
          route.get({
            path: '/api/users',
            handler: async () => [],
          }),
          route.get({
            path: '/api/posts',
            handler: async () => [],
          }),
        ],
      });

      expect(routes).toHaveLength(2);
      expect(routes[0]?.path).toBe('/api/users');
      expect(routes[1]?.path).toBe('/api/posts');
      expect(routes[0]?.middleware).toHaveLength(1);
      expect(routes[0]?.middleware?.[0]).toBe(mw);
      expect(routes[1]?.middleware).toHaveLength(1);
    });

    it('should accept route arrays in routes', () => {
      const mw: Middleware = async (_c, next) => {
        await next();
      };
      const userRoutes = [
        route.get({
          path: '/api/users',
          handler: async () => [],
        }),
        route.post({
          path: '/api/users',
          handler: async () => ({}),
        }),
      ];
      const routes = group({
        middleware: [mw],
        routes: [userRoutes],
      });

      expect(routes).toHaveLength(2);
      expect(routes[0]?.path).toBe('/api/users');
      expect(routes[0]?.middleware).toHaveLength(1);
    });
  });

  describe('combineRoutes', () => {
    it('should combine multiple route arrays', () => {
      const usersRoutes = [
        route.get({
          path: '/users',
          handler: async () => [],
        }),
      ];
      const postsRoutes = [
        route.get({
          path: '/posts',
          handler: async () => [],
        }),
      ];

      const combined = combineRoutes(usersRoutes, postsRoutes);

      expect(combined).toHaveLength(2);
      expect(combined[0]?.path).toBe('/users');
      expect(combined[1]?.path).toBe('/posts');
    });

    it('should accept single route definitions', () => {
      const single = route.get({
        path: '/health',
        handler: async () => ({
          ok: true,
        }),
      });
      const usersRoutes = [
        route.get({
          path: '/users',
          handler: async () => [],
        }),
      ];

      const combined = combineRoutes(single, usersRoutes);

      expect(combined).toHaveLength(2);
      expect(combined[0]?.path).toBe('/health');
      expect(combined[1]?.path).toBe('/users');
    });

    it('should handle empty arrays', () => {
      const combined = combineRoutes(
        [],
        [],
        [
          route.get({
            path: '/test',
            handler: async () => ({}),
          }),
        ]
      );

      expect(combined).toHaveLength(1);
    });

    it('should work with grouped routes', () => {
      const usersRoutes = group({
        prefix: '/users',
        routes: [
          route.get({
            path: '/',
            handler: async () => [],
          }),
          route.get({
            path: '/:id',
            handler: async () => ({}),
          }),
        ],
      });
      const postsRoutes = group({
        prefix: '/posts',
        routes: [
          route.get({
            path: '/',
            handler: async () => [],
          }),
        ],
      });

      const combined = combineRoutes(usersRoutes, postsRoutes);

      expect(combined).toHaveLength(3);
      expect(combined[0]?.path).toBe('/users');
      expect(combined[1]?.path).toBe('/users/:id');
      expect(combined[2]?.path).toBe('/posts');
    });
  });

  describe('createApp', () => {
    it('should create a Hono app', () => {
      const app = createApp([
        route.get({
          path: '/test',
          handler: async () => ({
            ok: true,
          }),
        }),
      ]);

      expect(app).toBeDefined();
      expect(typeof app.fetch).toBe('function');
    });

    it('should handle GET requests', async () => {
      const app = createApp([
        route.get({
          path: '/api/health',
          handler: async () => ({
            status: 'ok',
          }),
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/health'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        status: 'ok',
      });
    });

    it('should validate body with Zod schema', async () => {
      const app = createApp([
        route.post({
          path: '/api/users',
          body: z.object({
            name: z.string(),
            age: z.number(),
          }),
          handler: async ({ body }) => ({
            created: body.name,
          }),
        }),
      ]);

      // Valid request
      const validRes = await app.fetch(
        new Request('http://localhost/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'John',
            age: 30,
          }),
        })
      );
      expect(validRes.status).toBe(200);
      expect(await validRes.json()).toEqual({
        created: 'John',
      });

      // Invalid request - missing field
      const invalidRes = await app.fetch(
        new Request('http://localhost/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'John',
          }),
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
        route.get({
          path: '/api/search',
          query: z.object({
            q: z.string(),
            limit: z.string().optional(),
          }),
          handler: async ({ query }) => ({
            query: query.q,
          }),
        }),
      ]);

      // Valid request
      const validRes = await app.fetch(new Request('http://localhost/api/search?q=test'));
      expect(validRes.status).toBe(200);
      expect(await validRes.json()).toEqual({
        query: 'test',
      });

      // Invalid request - missing required query param
      const invalidRes = await app.fetch(new Request('http://localhost/api/search'));
      expect(invalidRes.status).toBe(400);
    });

    it('should handle path params', async () => {
      const app = createApp([
        route.get({
          path: '/api/users/:id',
          params: z.object({
            id: z.string(),
          }),
          handler: async ({ params }) => ({
            userId: params.id,
          }),
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/users/123'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        userId: '123',
      });
    });

    it('should handle HttpException', async () => {
      const app = createApp([
        route.get({
          path: '/api/user/:id',
          handler: ({ params }) => {
            const p = params as {
              id: string;
            };
            if (p.id === '404') {
              throw new NotFound('User not found');
            }
            return {
              id: p.id,
            };
          },
        }),
      ]);

      const notFoundRes = await app.fetch(new Request('http://localhost/api/user/404'));
      expect(notFoundRes.status).toBe(404);
      expect(await notFoundRes.json()).toEqual({
        error: 'User not found',
      });

      const okRes = await app.fetch(new Request('http://localhost/api/user/123'));
      expect(okRes.status).toBe(200);
    });

    it('should handle BadRequest exception', async () => {
      const app = createApp([
        route.post({
          path: '/api/validate',
          handler: () => {
            throw new BadRequest('Invalid data');
          },
        }),
      ]);

      const res = await app.fetch(
        new Request('http://localhost/api/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: '{}',
        })
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Invalid data',
      });
    });

    it('should return raw Response when handler returns Response', async () => {
      const app = createApp([
        route.get({
          path: '/api/stream',
          handler: () =>
            new Response('raw data', {
              headers: {
                'Content-Type': 'text/plain',
              },
            }),
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/stream'));
      expect(res.headers.get('Content-Type')).toBe('text/plain');
      expect(await res.text()).toBe('raw data');
    });

    it('should add CORS headers', async () => {
      const app = createApp([
        route.get({
          path: '/api/test',
          handler: async () => ({
            ok: true,
          }),
        }),
      ]);

      const res = await app.fetch(
        new Request('http://localhost/api/test', {
          headers: {
            Origin: 'http://example.com',
          },
        })
      );
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com');
    });

    it('should run per-route middleware before handler', async () => {
      const mw: Middleware = async (c, next) => {
        c.set('user', 'alice');
        await next();
      };
      const app = createApp([
        route.get({
          path: '/api/test',
          middleware: [mw],
          handler: (ctx) => ({
            user: ctx.get('user'),
          }),
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/test'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        user: 'alice',
      });
    });

    it('should allow middleware to short-circuit with a response', async () => {
      const blockMw: Middleware = async (c) => {
        return c.json(
          {
            error: 'blocked',
          },
          403
        );
      };
      const app = createApp([
        route.get({
          path: '/api/test',
          middleware: [blockMw],
          handler: () => ({
            ok: true,
          }),
        }),
      ]);

      const res = await app.fetch(new Request('http://localhost/api/test'));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: 'blocked',
      });
    });

    it('should run group middleware on grouped routes', async () => {
      const mw: Middleware = async (c, next) => {
        c.set('role', 'admin');
        await next();
      };
      const routes = group({
        prefix: '/api/admin',
        middleware: [mw],
        routes: [
          route.get({
            path: '/users',
            handler: (ctx) => ({
              role: ctx.get('role'),
            }),
          }),
        ],
      });
      const app = createApp(routes);

      const res = await app.fetch(new Request('http://localhost/api/admin/users'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        role: 'admin',
      });
    });

    it('should run middleware in order: global → group → route', async () => {
      const order: string[] = [];
      const globalMw: Middleware = async (_c, next) => {
        order.push('global');
        await next();
      };
      const groupMw: Middleware = async (_c, next) => {
        order.push('group');
        await next();
      };
      const routeMw: Middleware = async (_c, next) => {
        order.push('route');
        await next();
      };

      const routes = group({
        prefix: '/api',
        middleware: [groupMw],
        routes: [
          route.get({
            path: '/test',
            middleware: [routeMw],
            handler: () => {
              order.push('handler');
              return {
                ok: true,
              };
            },
          }),
        ],
      });
      const app = createApp(routes, [globalMw]);

      await app.fetch(new Request('http://localhost/api/test'));
      expect(order).toEqual(['global', 'group', 'route', 'handler']);
    });
  });
});
