import { singleton } from '@brika/di';

interface RegisteredRoute {
  pluginName: string;
  method: string;
  path: string;
}

/**
 * Well-known path prefixes that are addressed without the plugin uid in the
 * URL (e.g. `/api/oauth/:providerId/callback`). For these, two different
 * plugins registering the same `(method, path)` would be a hijack risk —
 * whichever registered first would receive the other's traffic. We reject
 * cross-plugin duplicates on these prefixes; everything else is fine
 * because plugin-scoped routes already live under `/api/plugins/:uid/...`.
 *
 * Adding a new well-known prefix here is the right way to opt new shared
 * routes into the same protection.
 */
const WELL_KNOWN_PREFIXES = ['/oauth/'] as const;

function isWellKnownPath(path: string): boolean {
  for (const prefix of WELL_KNOWN_PREFIXES) {
    if (path.startsWith(prefix)) {
      return true;
    }
  }
  return false;
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

  /**
   * Register a plugin route. Idempotent for the same `(pluginName, method,
   * path)` triple.
   *
   * @throws {Error} if `path` is a well-known shared route (`/oauth/...`)
   *   and another plugin already owns the same `(method, path)`. This
   *   prevents the OAuth callback hijack where a malicious plugin
   *   pre-registers `/oauth/spotify/callback` and intercepts the
   *   legitimate plugin's authorization code.
   */
  register(pluginName: string, method: string, path: string): void {
    if (isWellKnownPath(path)) {
      for (const existing of this.#routes.values()) {
        if (
          existing.method === method &&
          existing.path === path &&
          existing.pluginName !== pluginName
        ) {
          throw new Error(
            `Cannot register well-known route ${method} ${path} for plugin "${pluginName}": already owned by "${existing.pluginName}". Choose a different OAuth provider id.`
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
