import { getState, nextHookIdx } from './state';

export function useState<T>(initial: T | (() => T)): [
  T,
  (value: T | ((prev: T) => T)) => void,
] {
  const state = getState();
  const idx = nextHookIdx();

  if (state.hooks.length <= idx) {
    state.hooks[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
  }

  const setState = (value: T | ((prev: T) => T)) => {
    const prev = state.hooks[idx] as T;
    const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
    if (!Object.is(prev, next)) {
      state.hooks[idx] = next;
      state.scheduleRender();
    }
  };

  return [
    state.hooks[idx] as T,
    setState,
  ];
}
