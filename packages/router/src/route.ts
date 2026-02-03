import type { Handler, HttpMethod, RouteContext, RouteDefinition, Schema } from './types';

/**
 * Create a route definition with inferred return type.
 * Supports both with and without schema:
 *   route.get("/path", handler)
 *   route.get("/path", { params: z.object({...}) }, handler)
 */
function createRoute<S extends Schema, R>(
  method: HttpMethod,
  path: string,
  schemaOrHandler: S | Handler<S, R>,
  maybeHandler?: Handler<S, R>
): RouteDefinition<S, R> {
  const hasSchema = typeof schemaOrHandler === 'object' && maybeHandler !== undefined;

  return {
    method,
    path,
    schema: hasSchema ? (schemaOrHandler as S) : undefined,
    handler: hasSchema ? maybeHandler : (schemaOrHandler as Handler<S, R>),
  };
}

type RouteMethod = <S extends Schema, R>(
  path: string,
  schemaOrHandler: S | ((ctx: RouteContext<S>) => R | Promise<R>),
  maybeHandler?: (ctx: RouteContext<S>) => R | Promise<R>
) => RouteDefinition<S, Awaited<R>>;

function createMethod(method: HttpMethod): RouteMethod {
  return <S extends Schema, R>(
    path: string,
    schemaOrHandler: S | ((ctx: RouteContext<S>) => R | Promise<R>),
    maybeHandler?: (ctx: RouteContext<S>) => R | Promise<R>
  ) =>
    createRoute<S, Awaited<R>>(
      method,
      path,
      schemaOrHandler as S | Handler<S, Awaited<R>>,
      maybeHandler as Handler<S, Awaited<R>> | undefined
    );
}

/**
 * Route builder with fluent API.
 *
 * @example
 * ```ts
 * route.get("/users", async ({ inject }) => {
 *   return inject(UserService).list();
 * })
 *
 * route.get("/users/:id", {
 *   params: z.object({ id: z.string() })
 * }, async ({ params, inject }) => {
 *   const user = inject(UserService).get(params.id);
 *   if (!user) throw new NotFound();
 *   return user;
 * })
 * ```
 */
export const route = {
  get: createMethod('GET'),
  post: createMethod('POST'),
  put: createMethod('PUT'),
  patch: createMethod('PATCH'),
  delete: createMethod('DELETE'),
};
