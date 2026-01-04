import { inject } from '@elia/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError, z } from 'zod';
import { HttpException } from './exceptions';
import type { RouteContext, RouteDefinition, Schema } from './types';

/**
 * CORS configuration for the API.
 */
const corsConfig = {
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
};

/**
 * Parse and validate request data against Zod schemas.
 */
async function parseRequest<S extends Schema>(
  req: Request,
  params: Record<string, string>,
  schema?: S
) {
  const url = new URL(req.url);

  // Parse query string into object
  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  // Parse body if present
  let bodyData: unknown = undefined;
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const text = await req.text();
      bodyData = text ? JSON.parse(text) : {};
    }
  }

  return {
    params: schema?.params?.parse(params) ?? params,
    query: schema?.query?.parse(queryObj) ?? queryObj,
    body: schema?.body?.parse(bodyData) ?? bodyData,
  };
}

/**
 * Format Zod validation errors into a structured object.
 * Uses Zod 4's flattenError for clean field-level errors.
 * @see https://zod.dev/error-formatting
 */
function formatZodError(error: ZodError): {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
} {
  // Use Zod 4's flattenError utility
  return z.flattenError(error);
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

  // Add CORS middleware
  app.use('*', cors(corsConfig));

  // Global error handler for uncaught errors
  app.onError((error, c) => {
    // Handle HTTP exceptions
    if (error instanceof HttpException) {
      return c.json({ error: error.message }, error.status);
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const formatted = formatZodError(error);
      return c.json({ error: 'Validation failed', ...formatted }, 400);
    }

    console.error('[router] Unhandled error:', error);
    return c.json({ error: error.message }, 500);
  });

  // Register each route
  for (const routeDef of routes) {
    const method = routeDef.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';

    app[method](routeDef.path, async (c) => {
      // Parse and validate request
      const { params, query, body } = await parseRequest(c.req.raw, c.req.param(), routeDef.schema);

      // Build context with DI inject function
      const ctx: RouteContext = {
        params,
        query,
        body,
        inject,
        req: c.req.raw,
      };

      // Call handler
      const result = await routeDef.handler(ctx);

      // If handler returns a Response, use it directly (for SSE, file downloads, etc.)
      if (result instanceof Response) {
        return result;
      }

      // Return JSON response
      return c.json(result);
    });
  }

  return app;
}
