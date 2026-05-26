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
  /**
   * `Json` is the parsed JSON body for `application/json` requests.
   * `Uint8Array` carries raw bytes for binary uploads (the IPC channel
   * supports binary natively — no base64). The plugin route handler
   * inspects `headers['content-type']` to decide how to interpret it.
   */
  body: z.union([Json, z.instanceof(Uint8Array)]).optional(),
});
export type RouteRequest = z.infer<typeof RouteRequest>;

/**
 * Plugin route response body. `Json` covers strings/objects/arrays the hub
 * serialises and serves as `application/json` by default. `Uint8Array` is
 * carried natively over the IPC channel (the structured-clone codec we use
 * supports it without base64) and passed through to the HTTP `Response`
 * verbatim — set `content-type` in `headers` to declare the media type.
 */
export const RouteResponse = z.object({
  status: z.number(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.union([Json, z.instanceof(Uint8Array)]).optional(),
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

/**
 * Hub forwards an incoming HTTP request to the plugin.
 *
 * Plugin returns a `RouteResponse` with `{ status, headers?, body? }`.
 * Unhandled exceptions in the plugin are caught by the SDK and returned as
 * `{ status: 500, body: { error: string } }`.
 * IPC timeouts result in a 502 from the hub.
 */
export const routeRequest = rpc('routeRequest', RouteRequest, RouteResponse);
