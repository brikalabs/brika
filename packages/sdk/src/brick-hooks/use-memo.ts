import { depsChanged, getState, nextHookIdx } from './state';

export function useMemo<T>(factory: () => T, deps: unknown[]): T {
  const state = getState();
  const idx = nextHookIdx();

  const existing = state.hooks[idx] as
    | {
        value: T;
        deps: unknown[];
      }
    | undefined;
  if (!existing || depsChanged(existing.deps, deps)) {
    const value = factory();
    state.hooks[idx] = {
      value,
      deps,
    };
    return value;
  }
  return existing.value;
}

export function useCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps: unknown[]
): T {
  return useMemo(() => callback, deps);
}
