/**
 * Routes Contract
 *
 * Plugin-registered HTTP routes: registration and request proxying.
 */

import { z } from 'zod';
import { message, rpc } from '../define';
import { Json } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const RouteMethod = z.enum(['GET', 'POST', 'PUT', 'DELETE']);
export type RouteMethod = z.infer<typeof RouteMethod>;

export const RouteRequest = z.object({
  routeId: z.string(),
  method: z.string(),
  path: z.string(),
  query: z.record(z.string(), z.string()),
  headers: z.record(z.string(), z.string()),
  body: Json.optional(),
});
export type RouteRequest = z.infer<typeof RouteRequest>;

export const RouteResponse = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()).optional(),
  body: Json.optional(),
});
export type RouteResponse = z.infer<typeof RouteResponse>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers a route with the hub */
export const registerRoute = message(
  'registerRoute',
  z.object({
    method: RouteMethod,
    path: z.string(),
  })
);

/** Hub forwards an incoming HTTP request to the plugin */
export const routeRequest = rpc('routeRequest', RouteRequest, RouteResponse);
