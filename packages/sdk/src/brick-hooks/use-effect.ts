import { depsChanged, getState, nextHookIdx } from './state';

export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void {
  const state = getState();
  const idx = nextHookIdx();

  const existing = state.effects[idx];

  if (!existing || depsChanged(existing.deps, deps)) {
    // Defer effect execution to after render completes
    queueMicrotask(() => {
      // Cleanup previous effect
      if (existing && typeof existing.cleanup === 'function') {
        existing.cleanup();
      }
      const cleanup = effect();
      state.effects[idx] = {
        cleanup,
        deps,
      };
    });
  }
}
