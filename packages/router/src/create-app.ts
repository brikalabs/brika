import { inject } from '@brika/di';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { ZodError, z } from 'zod';
import { HttpException } from './exceptions';
import type { Middleware, RouteContext, RouteDefinition, Schema } from './types';

/**
 * CORS: Reflect the request origin so the browser accepts credentialed
 * responses (cookies). A literal '*' cannot be combined with credentials.
 * In production, replace with an explicit allowlist of trusted origins.
 */
const CORS_CONFIG = {
  origin: (origin: string) => origin,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

/**
 * Parse query string into a plain object.
 */
function parseQuery(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

/**
 * Parse JSON body if present and content-type is application/json.
 */
async function parseBody(req: Request): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return undefined;
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return undefined;
  }

  const text = await req.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Parse and validate request data against Zod schemas.
 */
async function parseRequest<S extends Schema>(
  req: Request,
  params: Record<string, string>,
  schema?: S
) {
  const url = new URL(req.url);
  const query = parseQuery(url);
  const body = await parseBody(req);

  return {
    params: schema?.params?.parse(params) ?? params,
    query: schema?.query?.parse(query) ?? query,
    body: schema?.body?.parse(body) ?? body,
  };
}

/**
 * Format Zod validation errors into a structured object.
 * @see https://zod.dev/error-formatting
 */
function formatZodError(error: ZodError) {
  return z.flattenError(error);
}

/**
 * Handle errors and return appropriate JSON response.
 */
function handleError(error: Error, c: { json: (data: unknown, status: number) => Response }) {
  if (error instanceof HttpException) {
    return c.json({ error: error.message, ...error.data }, error.status);
  }

  if (error instanceof ZodError) {
    return c.json({ error: 'Validation failed', ...formatZodError(error) }, 400);
  }

  console.error('[router] Unhandled error:', error);
  return c.json({ error: 'Internal server error' }, 500);
}

export type HonoContext = Context;
export type { Middleware } from './types';

/**
 * Create a route handler for a route definition.
 */
function createHandler(routeDef: RouteDefinition) {
  return async (c: {
    req: { raw: Request; param: () => Record<string, string> };
    json: (data: unknown) => Response;
    get(key: string): unknown;
  }) => {
    const { params, query, body } = await parseRequest(c.req.raw, c.req.param(), routeDef.schema);

    const ctx: RouteContext = {
      params,
      query,
      body,
      inject,
      req: c.req.raw,
      get: c.get,
    };

    const result = await routeDef.handler(ctx);

    // Return Response directly (for SSE, file downloads, etc.)
    if (result instanceof Response) {
      return result;
    }

    return c.json(result);
  };
}

/**
 * Create a Hono app from route definitions.
 *
 * @example
 * ```ts
 * const app = createApp(allRoutes, [verifyToken(), requireAuth()]);
 * Bun.serve({ fetch: app.fetch, port: 3000 });
 * ```
 */
export function createApp(routes: RouteDefinition[], middleware: Middleware[] = []): Hono {
  const app = new Hono();

  app.use('*', cors(CORS_CONFIG));

  for (const mw of middleware) {
    app.use('*', mw);
  }

  app.onError(handleError);

  for (const routeDef of routes) {
    const method = routeDef.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'put'
      | 'patch'
      | 'delete'
      | 'all';

    if (routeDef.middleware) {
      for (const mw of routeDef.middleware) {
        app[method](routeDef.path, mw);
      }
    }

    app[method](routeDef.path, createHandler(routeDef));
  }

  return app;
}
