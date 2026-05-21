import { singleton } from '@brika/di';

interface RegisteredRoute {
  pluginName: string;
  method: string;
  path: string;
}

/**
 * Well-known path prefixes resolved cross-plugin via {@link resolveByPath}.
 * Routes under these prefixes are first-come-first-served per (method, path),
 * so a second plugin claiming the same path could hijack the original.
 * `register` refuses cross-plugin re-registration under these prefixes.
 */
const WELL_KNOWN_PREFIXES: readonly string[] = ['/oauth/'];

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
    if (isWellKnown(path)) {
      // Refuse cross-plugin claims on a well-known path. Without this, plugin
      // A could pre-register /oauth/spotify/callback and steal the auth code
      // intended for the legitimate Spotify plugin (resolveByPath returns
      // the first match, oblivious to ownership). Same-plugin re-registration
      // stays idempotent.
      for (const existing of this.#routes.values()) {
        if (
          existing.method === method &&
          existing.path === path &&
          existing.pluginName !== pluginName
        ) {
          throw new Error(
            `Plugin "${pluginName}" cannot claim well-known route ${method} ${path} — ` +
              `already registered by "${existing.pluginName}".`
          );
        }
      }
    }
    const key = this.#key(pluginName, method, path);
    this.#routes.set(key, {
      pluginName,
      method,
      path,
    });
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
      if (route.method === method && route.path === path) {
        return route;
      }
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

function isWellKnown(path: string): boolean {
  return WELL_KNOWN_PREFIXES.some((p) => path.startsWith(p));
}
