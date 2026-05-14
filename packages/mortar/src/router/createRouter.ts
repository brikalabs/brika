/**
 * `createRouter` — the only stateful piece of the router. Owns a
 * history stack (so `back()` is O(1)) and a listener set the React
 * provider subscribes to for re-renders.
 */

import type { ActiveRoute, NavigateArgs, Router, RouterListener, RoutesShape } from './types';

export interface CreateRouterOptions<R extends RoutesShape> {
  readonly routes: R;
  /**
   * Initial active route. Pass the name and (if the route takes any)
   * the params — same shape as `navigate(name, params)`.
   */
  readonly initial: ActiveRoute<R>;
}

export function createRouter<R extends RoutesShape>(options: CreateRouterOptions<R>): Router<R> {
  const history: ActiveRoute<R>[] = [options.initial];
  const listeners = new Set<RouterListener>();

  const fire = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    routes: options.routes,
    get current(): ActiveRoute<R> {
      // Stack is non-empty by construction (seeded with `initial`,
      // and `back()` refuses to pop the last entry).
      return history[history.length - 1] as ActiveRoute<R>;
    },
    navigate<K extends keyof R>(name: K, ...args: NavigateArgs<R, K>): void {
      const params = args[0];
      // Casts via `unknown` because TS can't prove that `{ name, params? }`
      // satisfies the tagged-union variant for THIS specific `name` —
      // but at runtime each variant is exactly that shape.
      const entry =
        params === undefined
          ? ({ name } as unknown as ActiveRoute<R>)
          : ({ name, params } as unknown as ActiveRoute<R>);
      history.push(entry);
      fire();
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
