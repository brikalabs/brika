/**
 * `createRouter` — the only stateful piece of the router. Owns a
 * history stack of full paths (so `back()` is O(1)) and a listener
 * set the React provider subscribes to for re-renders.
 *
 * Each history entry is a complete path from root to leaf. `navigate`
 * pushes a single-segment path (top-level switch). `navigatePath`
 * pushes a multi-segment path (nested navigation, used by
 * `<Tabs router>` and direct deep links).
 */

import type {
  ActiveRoute,
  NavigateArgs,
  RoutePath,
  Router,
  RouterListener,
  RouteSegment,
  RoutesShape,
} from './types';

export interface CreateRouterOptions<R extends RoutesShape> {
  readonly routes: R;
  /**
   * Initial active route. Pass the name and (if the route takes any)
   * the params — same shape as `navigate(name, params)`.
   */
  readonly initial: ActiveRoute<R>;
}

export function createRouter<R extends RoutesShape>(options: CreateRouterOptions<R>): Router<R> {
  const initialPath: RoutePath = [segmentFromActive(options.initial)];
  const history: RoutePath[] = [initialPath];
  const listeners = new Set<RouterListener>();

  const fire = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const push = (path: RoutePath): void => {
    history.push(path);
    fire();
  };

  const replace = (path: RoutePath): void => {
    history[history.length - 1] = path;
    fire();
  };

  return {
    routes: options.routes,
    get current(): ActiveRoute<R> {
      return activeFromSegment(currentPath(history)[0]) as ActiveRoute<R>;
    },
    get path(): RoutePath {
      return currentPath(history);
    },
    navigate<K extends keyof R>(name: K, ...args: NavigateArgs<R, K>): void {
      const params = args[0];
      const segment: RouteSegment =
        params === undefined ? { name: String(name) } : { name: String(name), params };
      push([segment]);
    },
    navigatePath(path: RoutePath, options?: { readonly replace?: boolean }): void {
      if (path.length === 0) {
        return;
      }
      if (options?.replace) {
        replace(path);
      } else {
        push(path);
      }
    },
    back(): void {
      if (history.length > 1) {
        history.pop();
        fire();
      }
    },
    subscribe(listener: RouterListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function currentPath(history: RoutePath[]): RoutePath {
  // History is non-empty by construction (seeded with `initial`, and
  // `back()` refuses to pop the last entry).
  return history.at(-1) as RoutePath;
}

function segmentFromActive(active: { readonly name: string | number | symbol }): RouteSegment {
  const name = String(active.name);
  if ('params' in active && (active as { readonly params?: unknown }).params !== undefined) {
    return { name, params: (active as { readonly params?: unknown }).params };
  }
  return { name };
}

function activeFromSegment(segment: RouteSegment): {
  readonly name: string;
  readonly params?: unknown;
} {
  if (segment.params === undefined) {
    return { name: segment.name };
  }
  return { name: segment.name, params: segment.params };
}
