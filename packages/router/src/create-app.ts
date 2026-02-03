import { inject } from '@brika/di';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError, z } from 'zod';
import { HttpException } from './exceptions';
import type { RouteContext, RouteDefinition, Schema } from './types';

const CORS_CONFIG = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
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
  return c.json({ error: error.message }, 500);
}

/**
 * Create a route handler for a route definition.
 */
function createHandler(routeDef: RouteDefinition) {
  return async (c: {
    req: { raw: Request; param: () => Record<string, string> };
    json: (data: unknown) => Response;
  }) => {
    const { params, query, body } = await parseRequest(c.req.raw, c.req.param(), routeDef.schema);

    const ctx: RouteContext = {
      params,
      query,
      body,
      inject,
      req: c.req.raw,
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
 * const app = createApp([
 *   ...healthRoutes,
 *   ...userRoutes,
 *   ...postRoutes,
 * ]);
 *
 * Bun.serve({ fetch: app.fetch, port: 3000 });
 * ```
 */
export function createApp(routes: RouteDefinition[]): Hono {
  const app = new Hono();

  app.use('*', cors(CORS_CONFIG));
  app.onError(handleError);

  for (const routeDef of routes) {
    const method = routeDef.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    app[method](routeDef.path, createHandler(routeDef));
  }

  return app;
}
