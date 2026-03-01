/**
 * Routes Module
 *
 * Handles plugin route registration and request dispatching.
 * Self-registers with the context module system.
 */

import type { Json } from '@brika/ipc';
import {
  registerRoute as registerRouteMsg,
  routeRequest as routeRequestMsg,
} from '@brika/ipc/contract';
import { type ContextCore, registerContextModule } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

interface RouteResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Json;
}

type RouteHandler = (req: RouteRequest) => RouteResponse | Promise<RouteResponse>;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupRoutes(core: ContextCore) {
  const { client } = core;
  const handlers = new Map<string, RouteHandler>();

  client.implement(routeRequestMsg, async ({ routeId, method, path, query, headers, body }) => {
    const handler = handlers.get(routeId);
    if (!handler) {
      return {
        status: 404,
        body: {
          error: 'Route handler not found',
        },
      };
    }
    try {
      return await handler({
        method,
        path,
        query,
        headers,
        body,
      });
    } catch (e) {
      return {
        status: 500,
        body: {
          error: String(e),
        },
      };
    }
  });

  return {
    methods: {
      registerRoute(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        handler: RouteHandler
      ): void {
        const routeId = `${method}:${path}`;
        handlers.set(routeId, handler);
        client.send(registerRouteMsg, {
          method,
          path,
        });
      },
    },
  };
}

registerContextModule('routes', setupRoutes);
