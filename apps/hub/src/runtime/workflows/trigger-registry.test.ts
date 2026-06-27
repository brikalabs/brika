import { describe, expect, test } from 'bun:test';
import { type TriggerClock, TriggerRegistry } from './trigger-registry';

// A fake clock that returns REAL (unref'd, effectively-never-firing) handles so
// it satisfies TriggerClock without any cast, while capturing each callback so
// the test can fire it deterministically.
function fakeClock() {
  const NEVER_MS = 1 << 30;
  const scheduled = new Map<ReturnType<typeof setInterval>, { fn: () => void; ms: number }>();
  const clock: TriggerClock = {
    setInterval: (fn, ms) => {
      const handle = setInterval(() => {}, NEVER_MS);
      handle.unref?.();
      scheduled.set(handle, { fn, ms });
      return handle;
    },
    clearInterval: (handle) => {
      clearInterval(handle);
      scheduled.delete(handle);
    },
  };
  return {
    clock,
    count: () => scheduled.size,
    intervalsMs: () => [...scheduled.values()].map((s) => s.ms),
    fireAll: () => {
      for (const { fn } of scheduled.values()) {
        fn();
      }
    },
  };
}

describe('TriggerRegistry', () => {
  test('schedules an interval and fires the callback on tick', () => {
    const c = fakeClock();
    const reg = new TriggerRegistry(c.clock);
    let fired = 0;
    const ok = reg.register('block-1', { kind: 'interval', intervalMs: 1000 }, () => {
      fired++;
    });
    expect(ok).toBe(true);
    expect(reg.size).toBe(1);
    expect(c.intervalsMs()).toEqual([1000]);
    c.fireAll();
    c.fireAll();
    expect(fired).toBe(2);
  });

  test('rejects a non-positive or non-finite interval without scheduling', () => {
    const c = fakeClock();
    const reg = new TriggerRegistry(c.clock);
    expect(reg.register('b', { kind: 'interval', intervalMs: 0 }, () => {})).toBe(false);
    expect(reg.register('b', { kind: 'interval', intervalMs: -5 }, () => {})).toBe(false);
    expect(reg.register('b', { kind: 'interval', intervalMs: Number.NaN }, () => {})).toBe(false);
    expect(reg.size).toBe(0);
    expect(c.count()).toBe(0);
  });

  test('re-registering a block replaces its prior schedule', () => {
    const c = fakeClock();
    const reg = new TriggerRegistry(c.clock);
    reg.register('b', { kind: 'interval', intervalMs: 1000 }, () => {});
    reg.register('b', { kind: 'interval', intervalMs: 2000 }, () => {});
    expect(reg.size).toBe(1);
    expect(c.intervalsMs()).toEqual([2000]);
  });

  test('unregister cancels a single trigger', () => {
    const c = fakeClock();
    const reg = new TriggerRegistry(c.clock);
    reg.register('a', { kind: 'interval', intervalMs: 1000 }, () => {});
    reg.register('b', { kind: 'interval', intervalMs: 1000 }, () => {});
    reg.unregister('a');
    expect(reg.size).toBe(1);
    expect(c.count()).toBe(1);
  });

  test('clear cancels every trigger', () => {
    const c = fakeClock();
    const reg = new TriggerRegistry(c.clock);
    reg.register('a', { kind: 'interval', intervalMs: 1000 }, () => {});
    reg.register('b', { kind: 'interval', intervalMs: 2000 }, () => {});
    reg.clear();
    expect(reg.size).toBe(0);
    expect(c.count()).toBe(0);
  });

  test('a fired trigger no longer fires after unregister', () => {
    const c = fakeClock();
    const reg = new TriggerRegistry(c.clock);
    let fired = 0;
    reg.register('a', { kind: 'interval', intervalMs: 1000 }, () => {
      fired++;
    });
    c.fireAll();
    reg.unregister('a');
    c.fireAll(); // no-op: timer removed
    expect(fired).toBe(1);
  });
});
