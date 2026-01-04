import type { InjectionToken } from '@brika/shared';
import type { output, ZodType } from 'zod';

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
}

/**
 * Route handler function.
 * Return any object to send as JSON, or throw HttpException for errors.
 * Return a Response object to bypass JSON serialization (useful for SSE, file downloads).
 */
export type Handler<S extends Schema = Schema> = (
  ctx: RouteContext<S>
) => Promise<unknown | Response> | unknown | Response;

/**
 * Supported HTTP methods.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Internal route definition.
 */
export interface RouteDefinition<S extends Schema = Schema> {
  method: HttpMethod;
  path: string;
  schema?: S;
  handler: Handler<S>;
}
