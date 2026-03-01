import { getState, nextHookIdx } from './state';

export function useRef<T>(initial: T): {
  current: T;
} {
  const state = getState();
  const idx = nextHookIdx();

  if (state.hooks.length <= idx) {
    state.hooks[idx] = {
      current: initial,
    };
  }
  return state.hooks[idx] as {
    current: T;
  };
}
