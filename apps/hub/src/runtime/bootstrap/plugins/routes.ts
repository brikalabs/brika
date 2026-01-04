import type { RouteDefinition } from '@elia/router';
import { inject } from '@elia/shared';
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
    onStart: () => server.start(),
    onStop: () => server.stop(),
  };
}
