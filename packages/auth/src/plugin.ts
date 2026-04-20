/**
 * @brika/auth - Bootstrap Plugin
 *
 * Single entry point: opens SQLite, registers services,
 * optionally wires HTTP middleware + routes.
 *
 * @example Hub
 * ```ts
 * await bootstrap()
 *   .use(auth({ server: inject(ApiServer) }))
 *   .start();
 * ```
 *
 * @example CLI
 * ```ts
 * await bootstrapCLI(auth()).start();
 * ```
 */

import { inject } from '@brika/di';
import type { Middleware, RouteDefinition } from '@brika/router';
import type { AuthConfig } from './config';
import { verifyToken } from './middleware/verifyToken';
import { allAuthRoutes as authRoutes } from './server/routes/index';
import { SessionService } from './services/SessionService';
import { openAuthDatabase, setupAuthServices } from './setup';

interface ApiServer {
  addMiddleware(mw: Middleware): void;
  addRoutes(routes: RouteDefinition[]): void;
}

export interface AuthPluginOptions {
  /** API server — pass to enable HTTP middleware + routes (hub mode) */
  server?: ApiServer;
  /** Auth configuration overrides (session TTL, password policy, etc.) */
  config?: AuthConfig;
}

/**
 * Auth bootstrap plugin.
 */
export function auth(options: AuthPluginOptions = {}) {
  const { server, config } = options;
  let database: ReturnType<typeof openAuthDatabase> | undefined;
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Run expired session cleanup every 6 hours */
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;

  return {
    name: 'auth',

    setup() {
      database = openAuthDatabase();
      setupAuthServices(database, config);

      if (server) {
        server.addMiddleware(verifyToken());
        server.addRoutes(authRoutes);
      }
    },

    onStart() {
      const sessionService = inject(SessionService);
      // Initial cleanup on startup, then periodically
      sessionService.cleanExpiredSessions();
      cleanupTimer = setInterval(() => sessionService.cleanExpiredSessions(), CLEANUP_INTERVAL);
      cleanupTimer.unref();
    },

    onStop() {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
      database?.sqlite.close();
    },
  };
}
