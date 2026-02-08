import { singleton } from '@brika/di';

interface RegisteredRoute {
  pluginName: string;
  method: string;
  path: string;
}

/**
 * Tracks HTTP routes registered by plugins.
 * Routes are namespaced: plugin registers "/foo" → served at /api/plugins/:uid/routes/foo
 */
@singleton()
export class PluginRouteRegistry {
  readonly #routes = new Map<string, RegisteredRoute>();

  #key(pluginName: string, method: string, path: string): string {
    return `${pluginName}:${method}:${path}`;
  }

  register(pluginName: string, method: string, path: string): void {
    const key = this.#key(pluginName, method, path);
    this.#routes.set(key, { pluginName, method, path });
  }

  /**
   * Find the plugin that owns a route for a given method and path.
   */
  resolve(pluginName: string, method: string, path: string): RegisteredRoute | undefined {
    const key = this.#key(pluginName, method, path);
    return this.#routes.get(key);
  }

  /**
   * Find any plugin that registered a route matching this method and path.
   * Used for well-known routes like /api/oauth/* where the plugin name is unknown.
   */
  resolveByPath(method: string, path: string): RegisteredRoute | undefined {
    for (const route of this.#routes.values()) {
      if (route.method === method && route.path === path) return route;
    }
    return undefined;
  }

  listByPlugin(pluginName: string): RegisteredRoute[] {
    return [...this.#routes.values()].filter((r) => r.pluginName === pluginName);
  }

  unregisterPlugin(pluginName: string): void {
    for (const [key, route] of this.#routes) {
      if (route.pluginName === pluginName) {
        this.#routes.delete(key);
      }
    }
  }
}
