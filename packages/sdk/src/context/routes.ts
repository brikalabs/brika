/**
 * Routes Module
 *
 * Thin typed wrapper over the prelude's route handler registry.
 * Self-registers with the context module system.
 */

import type { RouteRequest, RouteResponse } from '../types';
import { type ContextCore, registerContextModule, requireBridge } from './register';

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteHandler = (req: RouteRequest) => RouteResponse | Promise<RouteResponse>;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupRoutes(_core: ContextCore) {
  const bridge = requireBridge();

  return {
    methods: {
      registerRoute(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        handler: RouteHandler
      ): void {
        bridge.registerRoute(method, path, handler);
      },
    },
  };
}

registerContextModule('routes', setupRoutes);
