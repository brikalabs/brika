import { inject } from '@brika/di';
import type { RouteDefinition } from '@brika/router';
import { ApiServer } from '@/runtime/http/api-server';
import type { BootstrapPlugin } from '../plugin';

/**
 * Creates a plugin that registers routes and manages the API server lifecycle.
 */
export function routes(definitions: RouteDefinition[]): BootstrapPlugin {
  const server = inject(ApiServer);
  server.addRoutes(definitions);

  return {
    name: 'routes',
    // A hub that can't bind its API port must not keep running: it
    // would load plugins and execute workflows while unreachable (the
    // classic symptom is a second hub booting while an orphaned one
    // still holds the port).
    fatal: true,
    onStart: () => server.start(),
    // Drain in-flight requests: server.stop() stops accepting new
    // connections immediately and resolves once active requests finish.
    onStop: () => server.stop(),
  };
}
