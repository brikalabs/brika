import type { InjectionToken } from '@brika/di';
import type { Context } from 'hono';
import type { output, ZodType } from 'zod';

/**
 * Hono-compatible middleware function.
 * Runs before the route handler. Call `next()` to continue, or return a Response to short-circuit.
 */
export type Middleware = (
  c: Context,
  next: () => Promise<void>
) => Promise<void | Response>;

/**
 * Schema definition for route validation.
 * All fields are optional - only define what you need.
 */
export interface Schema {
  /** Path parameters (e.g., /:id) */
  params?: ZodType;
  /** Query string parameters (e.g., ?foo=bar) */
  query?: ZodType;
  /** Request body (POST/PUT/PATCH) */
  body?: ZodType;
}

/**
 * Infer the type from a Zod schema, or fallback to a default type.
 */
type InferOrDefault<T, D> = T extends ZodType ? output<T> : D;

/**
 * Context passed to route handlers.
 * Types are inferred from the schema definition.
 */
export interface RouteContext<S extends Schema = Schema> {
  /** Validated path parameters */
  params: InferOrDefault<S['params'], Record<string, string>>;
  /** Validated query parameters */
  query: InferOrDefault<S['query'], Record<string, string>>;
  /** Validated request body */
  body: InferOrDefault<S['body'], unknown>;
  /** Dependency injection function */
  inject: <T>(token: InjectionToken<T>) => T;
  /** Raw request object */
  req: Request;
  /** Retrieve a value from the request context (set by middleware) */
  get(key: string): unknown;
}

/**
 * Route handler function.
 * Return any object to send as JSON, or throw HttpException for errors.
 * Return a Response object to bypass JSON serialization (useful for SSE, file downloads).
 */
export type Handler<S extends Schema = Schema, R = unknown> = (
  ctx: RouteContext<S>
) => Promise<R | Response> | R | Response;

/**
 * Supported HTTP methods.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ALL';

/**
 * Internal route definition.
 * R is the return type of the handler (for type inference in testing).
 */
export interface RouteDefinition<S extends Schema = Schema, R = unknown> {
  method: HttpMethod;
  path: string;
  schema?: S;
  handler: Handler<S, R>;
  /** Per-route middleware, runs before the handler (in order). */
  middleware?: Middleware[];
}

/**
 * Extract the input types required by a route's schema.
 */
export type RouteInput<S extends Schema> = {
  params?: InferOrDefault<S['params'], Record<string, string>>;
  query?: InferOrDefault<S['query'], Record<string, string>>;
  body?: InferOrDefault<S['body'], unknown>;
  headers?: Record<string, string>;
};
