/**
 * Plugin Routes API
 *
 * Register HTTP routes that the hub serves on behalf of the plugin.
 * Routes are accessible at: /api/plugins/:uid/routes/<path>
 */

import type { Json } from '@brika/ipc';
import { getContext } from '../context';

export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RouteRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export interface RouteResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Json;
}

export type RouteHandler = (req: RouteRequest) => RouteResponse | Promise<RouteResponse>;

/**
 * Register an HTTP route on the hub.
 *
 * The handler receives a `RouteRequest` and must return a `RouteResponse`.
 * Unhandled exceptions inside the handler are caught by the SDK and returned
 * as `{ status: 500, body: { error: "..." } }` to the caller.
 *
 * @example
 * ```ts
 * import { defineRoute } from '@brika/sdk';
 *
 * defineRoute('GET', '/status', () => ({
 *   status: 200,
 *   body: { ok: true },
 * }));
 *
 * // Accessible at: /api/plugins/:uid/routes/status
 * ```
 */
export function defineRoute(method: RouteMethod, path: string, handler: RouteHandler): void {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  getContext().registerRoute(method, normalizedPath, handler);
}
