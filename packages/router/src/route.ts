import type { ZodType } from 'zod';
import type { Handler, HttpMethod, Middleware, RouteContext, RouteDefinition } from './types';

/**
 * Route configuration object.
 * Pass Zod schemas for params/query/body to get typed handler context.
 *
 * @example
 * ```ts
 * route.get({
 *   path: '/users/:id',
 *   params: z.object({ id: z.string() }),
 *   handler: ({ params }) => getUserById(params.id),
 * })
 * ```
 */
type RouteConfig<
  P extends ZodType | undefined = undefined,
  Q extends ZodType | undefined = undefined,
  B extends ZodType | undefined = undefined,
  R = unknown,
> = {
  path: string;
  params?: P;
  query?: Q;
  body?: B;
  middleware?: Middleware[];
  handler: (ctx: RouteContext<{ params: P; query: Q; body: B }>) => R | Promise<R>;
};

type ConfigSchema<
  P extends ZodType | undefined,
  Q extends ZodType | undefined,
  B extends ZodType | undefined,
> = { params: P; query: Q; body: B };

function buildRoute<
  P extends ZodType | undefined,
  Q extends ZodType | undefined,
  B extends ZodType | undefined,
  R,
>(
  method: HttpMethod,
  config: RouteConfig<P, Q, B, R>
): RouteDefinition<ConfigSchema<P, Q, B>, Awaited<R>> {
  const schema: Record<string, unknown> = {};
  if (config.params) schema.params = config.params;
  if (config.query) schema.query = config.query;
  if (config.body) schema.body = config.body;

  return {
    method,
    path: config.path,
    ...(Object.keys(schema).length > 0 && { schema: schema as ConfigSchema<P, Q, B> }),
    handler: config.handler as Handler<ConfigSchema<P, Q, B>, Awaited<R>>,
    middleware: config.middleware,
  };
}

function createMethod(method: HttpMethod) {
  return <
    P extends ZodType | undefined = undefined,
    Q extends ZodType | undefined = undefined,
    B extends ZodType | undefined = undefined,
    R = unknown,
  >(
    config: RouteConfig<P, Q, B, R>
  ): RouteDefinition<ConfigSchema<P, Q, B>, Awaited<R>> => buildRoute(method, config);
}

/**
 * Route builder with config-object API.
 *
 * @example
 * ```ts
 * // Simple route
 * route.get({ path: '/health', handler: () => ({ ok: true }) })
 *
 * // With Zod schemas — handler params/body/query are fully typed
 * route.post({
 *   path: '/users',
 *   body: z.object({ name: z.string(), email: z.string().email() }),
 *   handler: ({ body }) => createUser(body.name, body.email),
 * })
 *
 * // With middleware
 * route.get({
 *   path: '/admin/users',
 *   middleware: [requireScope(Scope.ADMIN_ALL)],
 *   handler: ({ inject }) => inject(UserService).list(),
 * })
 * ```
 */
export const route = {
  get: createMethod('GET'),
  post: createMethod('POST'),
  put: createMethod('PUT'),
  patch: createMethod('PATCH'),
  delete: createMethod('DELETE'),
  all: createMethod('ALL'),
};
