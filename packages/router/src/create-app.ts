import { inject } from '@brika/di';
import { BrikaError, httpStatusForCode, lookupCatalogEntry } from '@brika/ipc';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { ZodError, z } from 'zod';
import { HttpException } from './exceptions';
import type { Middleware, RouteContext, RouteDefinition, Schema } from './types';

export type CorsOriginMatcher =
  | string
  | RegExp
  | ((origin: string) => boolean)
  | Array<string | RegExp | ((origin: string) => boolean)>;

export interface CreateAppOptions {
  /**
   * CORS origin policy. Defaults to reflect-any-origin for backwards compatibility
   * with dev setups (Vite on a different port). Production hubs should pass an
   * explicit allowlist (LAN host + remote origin) to prevent cross-site credential theft.
   * Pass the string '*' to reflect any origin.
   */
  cors?: CorsOriginMatcher;
}

function matchOrigin(origin: string, matcher: CorsOriginMatcher | undefined): boolean {
  if (matcher === undefined || matcher === '*') {
    return true;
  }
  const matchers = Array.isArray(matcher) ? matcher : [matcher];
  for (const m of matchers) {
    if (typeof m === 'string') {
      if (m === '*' || m === origin) {
        return true;
      }
    } else if (m instanceof RegExp) {
      if (m.test(origin)) {
        return true;
      }
    } else if (m(origin)) {
      return true;
    }
  }
  return false;
}

function buildCorsConfig(matcher: CorsOriginMatcher | undefined) {
  return {
    origin: (origin: string) => (matchOrigin(origin, matcher) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Brika-Csrf'],
    credentials: true,
  };
}

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
function handleError(
  error: Error,
  c: {
    json: (data: unknown, status: number) => Response;
  }
) {
  // Router-native exceptions keep the flat shape callers built UIs against.
  if (error instanceof HttpException) {
    return c.json(
      {
        error: error.message,
        ...error.data,
      },
      error.status
    );
  }

  // Platform-typed errors get the catalog's httpStatus + structured envelope
  // with i18nKey/developerHint when the code is registered. A route handler
  // that throws `BrikaError('NOT_FOUND', ...)` now becomes a real 404 with
  // the resource path attached, not a generic 500.
  if (error instanceof BrikaError) {
    const entry = lookupCatalogEntry(error.code);
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.data === undefined ? {} : { data: error.data }),
          ...(entry?.i18nKey === undefined ? {} : { i18nKey: entry.i18nKey }),
          ...(entry?.developerHint === undefined
            ? {}
            : { developerHint: entry.developerHint }),
        },
      },
      httpStatusForCode(error.code)
    );
  }

  if (error instanceof ZodError) {
    return c.json(
      {
        error: 'Validation failed',
        ...formatZodError(error),
      },
      400
    );
  }

  console.error('[router] Unhandled error:', error);
  return c.json(
    {
      error: 'Internal server error',
    },
    500
  );
}

export type HonoContext = Context;
export type { Middleware } from './types';

/**
 * Create a route handler for a route definition.
 */
function createHandler(routeDef: RouteDefinition) {
  return async (c: {
    req: {
      raw: Request;
      param: () => Record<string, string>;
    };
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
export function createApp(
  routes: RouteDefinition[],
  middleware: Middleware[] = [],
  options: CreateAppOptions = {}
): Hono {
  const app = new Hono();

  app.use('*', cors(buildCorsConfig(options.cors)));

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
