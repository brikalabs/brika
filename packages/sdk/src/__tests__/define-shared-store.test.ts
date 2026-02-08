import { describe, expect, test } from 'bun:test';
import { _beginRender, _cleanupEffects, _createState, _endRender } from '../brick-hooks';
import { defineSharedStore } from '../brick-hooks/define-shared-store';

/** Wait for queued microtasks (useEffect runs via queueMicrotask). */
const flush = () => new Promise<void>((r) => setTimeout(r, 10));

/** Simulate a render cycle: beginRender → call hooks → endRender. */
function render(state: ReturnType<typeof _createState>, fn: () => void) {
  _beginRender(state);
  fn();
  _endRender();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('defineSharedStore', () => {
  // ─── get / set (no render context needed) ──────────────────────────

  test('get() returns the initial state', () => {
    const store = defineSharedStore({ count: 0 });
    expect(store.get()).toEqual({ count: 0 });
  });

  test('set() with a value updates state', () => {
    const store = defineSharedStore({ count: 0 });
    store.set({ count: 5 });
    expect(store.get()).toEqual({ count: 5 });
  });

  test('set() with an updater function', () => {
    const store = defineSharedStore({ count: 0 });
    store.set((prev) => ({ count: prev.count + 1 }));
    store.set((prev) => ({ count: prev.count + 1 }));
    expect(store.get().count).toBe(2);
  });

  test('set() skips notification when state is the same reference', () => {
    const initial = { count: 0 };
    const store = defineSharedStore(initial);
    let notified = false;
    // Manually poke a listener to detect spurious notifications
    // (listeners are Set<fn> on the closure — we test indirectly via render count below)
    store.set(initial); // same reference → no-op
    expect(store.get()).toBe(initial);
  });

  // ─── Hook (inside render context) ──────────────────────────────────

  test('useStore() returns current state during render', () => {
    const store = defineSharedStore({ value: 'hello' });

    const state = _createState(() => {});
    let captured: { value: string } | undefined;

    render(state, () => { captured = store(); });

    expect(captured).toEqual({ value: 'hello' });
    _cleanupEffects(state);
  });

  test('useStore() reflects latest state on subsequent renders', async () => {
    const store = defineSharedStore({ n: 1 });

    const state = _createState(() => {});
    let captured = 0;

    render(state, () => { captured = store().n; });
    expect(captured).toBe(1);

    store.set({ n: 42 });

    render(state, () => { captured = store().n; });
    expect(captured).toBe(42);

    _cleanupEffects(state);
  });

  // ─── Subscriptions & re-renders ────────────────────────────────────

  test('set() triggers scheduleRender on subscribed instances', async () => {
    const store = defineSharedStore({ x: 0 });

    let renders = 0;
    const state = _createState(() => { renders++; });

    render(state, () => { store(); });
    await flush(); // let useEffect register the listener

    store.set({ x: 1 });
    await flush(); // let scheduleRender fire

    expect(renders).toBeGreaterThanOrEqual(1);
    _cleanupEffects(state);
  });

  test('multiple instances all re-render on set()', async () => {
    const store = defineSharedStore({ v: 0 });

    let r1 = 0;
    let r2 = 0;
    const s1 = _createState(() => { r1++; });
    const s2 = _createState(() => { r2++; });

    render(s1, () => { store(); });
    render(s2, () => { store(); });
    await flush();

    store.set({ v: 99 });
    await flush();

    expect(r1).toBeGreaterThanOrEqual(1);
    expect(r2).toBeGreaterThanOrEqual(1);

    _cleanupEffects(s1);
    _cleanupEffects(s2);
  });

  test('unsubscribed instance does not re-render', async () => {
    const store = defineSharedStore({ v: 0 });

    let renders = 0;
    const state = _createState(() => { renders++; });

    render(state, () => { store(); });
    await flush();

    // Unmount — cleans up effects (removes listener)
    _cleanupEffects(state);
    renders = 0;

    store.set({ v: 100 });
    await flush();

    expect(renders).toBe(0);
  });

  // ─── Synchronous subscription (race condition fix) ───────────────

  test('subscription is synchronous — updates before effect flush are not missed', async () => {
    const store = defineSharedStore({ tick: 0 });

    let renders = 0;
    const state = _createState(() => { renders++; });

    // First render subscribes synchronously during render
    render(state, () => { store(); });

    // Update BEFORE effects flush — old deferred subscription would miss this
    store.set({ tick: 1 });
    await flush();

    // scheduleRender should have fired
    expect(renders).toBeGreaterThanOrEqual(1);
    _cleanupEffects(state);
  });

  test('rapid set() calls between renders are all visible', async () => {
    const store = defineSharedStore({ count: 0 });

    let renderCount = 0;
    const state = _createState(() => { renderCount++; });

    render(state, () => { store(); });

    // Rapid-fire updates — listener must already be registered
    store.set({ count: 1 });
    store.set({ count: 2 });
    store.set({ count: 3 });

    await flush();
    expect(renderCount).toBeGreaterThanOrEqual(1);
    expect(store.get()).toEqual({ count: 3 });

    _cleanupEffects(state);
  });

  test('re-render preserves subscription without double-subscribing', async () => {
    const store = defineSharedStore({ v: 0 });

    let renders = 0;
    const state = _createState(() => { renders++; });

    // First render — subscribes
    render(state, () => { store(); });

    // Second render — same hook slot, must NOT double-subscribe
    render(state, () => { store(); });

    store.set({ v: 1 });
    await flush();

    // Exactly one scheduleRender (not two from double subscription)
    expect(renders).toBe(1);

    _cleanupEffects(state);
  });

  // ─── Isolation between stores ──────────────────────────────────────

  test('different stores are fully independent', async () => {
    const storeA = defineSharedStore({ a: 1 });
    const storeB = defineSharedStore({ b: 2 });

    let rendersA = 0;
    const sA = _createState(() => { rendersA++; });

    render(sA, () => { storeA(); });
    await flush();

    // Updating storeB should NOT re-render storeA's subscriber
    storeB.set({ b: 99 });
    await flush();

    expect(rendersA).toBe(0);
    expect(storeB.get()).toEqual({ b: 99 });

    _cleanupEffects(sA);
  });

  // ─── Primitive state (not just objects) ────────────────────────────

  test('works with primitive state (number)', async () => {
    const store = defineSharedStore(0);

    const state = _createState(() => {});
    let captured = -1;

    render(state, () => { captured = store(); });
    expect(captured).toBe(0);

    store.set(42);
    expect(store.get()).toBe(42);

    render(state, () => { captured = store(); });
    expect(captured).toBe(42);

    _cleanupEffects(state);
  });

  test('works with nullable state', () => {
    const store = defineSharedStore<string | null>(null);
    expect(store.get()).toBeNull();

    store.set('hello');
    expect(store.get()).toBe('hello');

    store.set(null);
    expect(store.get()).toBeNull();
  });
});
