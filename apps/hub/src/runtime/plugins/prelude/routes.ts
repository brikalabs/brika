/**
 * Prelude Routes Module
 *
 * Route handler registry and routeRequest RPC implementation.
 */

import { BrikaError, httpStatusForCode } from '@brika/errors';
import type { Channel } from '@brika/ipc';
import {
  type RouteMethodType,
  type RouteRequestType,
  type RouteResponseType,
  registerRoute as registerRouteMsg,
  routeRequest as routeRequestRpc,
} from '@brika/ipc/contract';

type RouteRequest = Omit<RouteRequestType, 'routeId'>;
type RouteHandler = (req: RouteRequest) => RouteResponseType | Promise<RouteResponseType>;

export function setupRoutes(channel: Channel) {
  const handlers = new Map<string, RouteHandler>();

  channel.implement(routeRequestRpc, async ({ routeId, method, path, query, headers, body }) => {
    const handler = handlers.get(routeId);
    if (!handler) {
      return { status: 404, body: { error: 'Route handler not found' } };
    }
    try {
      return await handler({ method, path, query, headers, body });
    } catch (e) {
      // Map BrikaError codes to their canonical HTTP status (e.g.
      // PERMISSION_DENIED → 403, INVALID_INPUT → 400, NOT_FOUND → 404,
      // TIMEOUT → 504). Unknown / non-Brika errors fall through to 500.
      if (e instanceof BrikaError) {
        return {
          status: httpStatusForCode(e.code),
          body: { error: e.message, code: e.code },
        };
      }
      return { status: 500, body: { error: String(e) } };
    }
  });

  return {
    registerRoute(method: RouteMethodType, path: string, handler: RouteHandler): void {
      const routeId = `${method}:${path}`;
      handlers.set(routeId, handler);
      channel.send(registerRouteMsg, { method, path });
    },
  };
}
