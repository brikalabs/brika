import { describe, expect, mock, test } from 'bun:test';
import { defineSharedStore } from '../api/shared-store';

describe('defineSharedStore', () => {
  test('get() returns initial state', () => {
    const store = defineSharedStore({ count: 0 });
    expect(store.get()).toEqual({ count: 0 });
  });

  test('set() with value updates state', () => {
    const store = defineSharedStore({ count: 0 });
    store.set({ count: 5 });
    expect(store.get()).toEqual({ count: 5 });
  });

  test('set() with updater function receives prev state', () => {
    const store = defineSharedStore({ count: 3 });
    store.set((prev) => ({ count: prev.count + 1 }));
    expect(store.get()).toEqual({ count: 4 });
  });

  test('set() notifies subscribers', () => {
    const store = defineSharedStore(0);
    const listener = mock(() => {
      /* noop */
    });
    store.subscribe(listener);
    store.set(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('set() skips notification when value is identical (Object.is)', () => {
    const store = defineSharedStore({ x: 1 });
    const listener = mock(() => {
      /* noop */
    });
    store.subscribe(listener);
    const same = store.get();
    store.set(same);
    expect(listener).toHaveBeenCalledTimes(0);
  });

  test('subscribe() returns unsubscribe function', () => {
    const store = defineSharedStore(0);
    const listener = mock(() => {
      /* noop */
    });
    const unsub = store.subscribe(listener);
    store.set(1);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    store.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('multiple subscribers all receive notifications', () => {
    const store = defineSharedStore(0);
    const a = mock(() => {
      /* noop */
    });
    const b = mock(() => {
      /* noop */
    });
    store.subscribe(a);
    store.subscribe(b);
    store.set(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
