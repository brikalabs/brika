/**
 * Prelude Routes Module
 *
 * Route handler registry and routeRequest RPC implementation.
 */

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
