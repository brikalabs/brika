/**
 * @brika/auth - Bootstrap Plugin
 *
 * Single entry point: opens SQLite, registers services,
 * optionally wires HTTP middleware + routes.
 *
 * @example Hub
 * ```ts
 * await bootstrap()
 *   .use(auth({ dataDir, server: inject(ApiServer) }))
 *   .start();
 * ```
 *
 * @example CLI
 * ```ts
 * await bootstrapCLI()
 *   .use(auth({ dataDir }))
 *   .start();
 * ```
 */

import { join } from 'node:path';
import type { Middleware, RouteDefinition } from '@brika/router';
import { inject } from '@brika/di';
import { openAuthDatabase, setupAuthServices } from './setup';
import { verifyToken } from './middleware/verifyToken';
import { allAuthRoutes as authRoutes } from './server/routes/index';
import { SessionService } from './services/SessionService';
import type { Database } from 'bun:sqlite';
import type { AuthConfig } from './config';

interface ApiServer {
  addMiddleware(mw: Middleware): void;
  addRoutes(routes: RouteDefinition[]): void;
}

export interface AuthPluginOptions {
  /** Root data directory (e.g. ~/.brika or .brika) */
  dataDir: string;
  /** API server — pass to enable HTTP middleware + routes (hub mode) */
  server?: ApiServer;
  /** Auth configuration overrides (session TTL, password policy, etc.) */
  config?: AuthConfig;
}

/**
 * Auth bootstrap plugin.
 */
export function auth(options: AuthPluginOptions) {
  const { dataDir, server, config } = options;
  let db: Database;
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Run expired session cleanup every 6 hours */
  const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;

  return {
    name: 'auth',

    setup() {
      db = openAuthDatabase(join(dataDir, 'auth.db'));
      setupAuthServices(db, config);

      if (server) {
        server.addMiddleware(verifyToken());
        server.addRoutes(authRoutes);
      }
    },

    async onStart() {
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
      db?.close();
    },
  };
}
