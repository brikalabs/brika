import type { Schema, Handler, RouteDefinition, HttpMethod } from "./types";

/**
 * Create a route definition.
 * Supports both with and without schema:
 *   route.get("/path", handler)
 *   route.get("/path", { params: z.object({...}) }, handler)
 */
function createRoute<S extends Schema>(
  method: HttpMethod,
  path: string,
  schemaOrHandler: S | Handler<S>,
  maybeHandler?: Handler<S>,
): RouteDefinition<S> {
  const hasSchema = typeof schemaOrHandler === "object" && maybeHandler !== undefined;

  return {
    method,
    path,
    schema: hasSchema ? (schemaOrHandler as S) : undefined,
    handler: hasSchema ? maybeHandler : (schemaOrHandler as Handler<S>),
  };
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
  get: <S extends Schema>(path: string, schemaOrHandler: S | Handler<S>, maybeHandler?: Handler<S>) =>
    createRoute("GET", path, schemaOrHandler, maybeHandler),

  post: <S extends Schema>(path: string, schemaOrHandler: S | Handler<S>, maybeHandler?: Handler<S>) =>
    createRoute("POST", path, schemaOrHandler, maybeHandler),

  put: <S extends Schema>(path: string, schemaOrHandler: S | Handler<S>, maybeHandler?: Handler<S>) =>
    createRoute("PUT", path, schemaOrHandler, maybeHandler),

  patch: <S extends Schema>(path: string, schemaOrHandler: S | Handler<S>, maybeHandler?: Handler<S>) =>
    createRoute("PATCH", path, schemaOrHandler, maybeHandler),

  delete: <S extends Schema>(path: string, schemaOrHandler: S | Handler<S>, maybeHandler?: Handler<S>) =>
    createRoute("DELETE", path, schemaOrHandler, maybeHandler),
};
