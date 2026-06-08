/**
 * Deterministic fake clock for block tests.
 *
 * Blocks schedule with the global `setTimeout`/`setInterval` and read time with
 * `Date.now()`. Installing this clock swaps those globals for an in-memory queue
 * so `runBlock` tests can advance time instantly and predictably instead of
 * waiting on real timers. Restored on `uninstall()`.
 */

/** Time control handed to block-test authors. */
export interface TestClock {
  /** Current fake time in ms. */
  now(): number;
  /** Advance time by `ms`, firing every timer due in that window, in order. */
  advance(ms: number): Promise<void>;
}

export interface InstalledClock extends TestClock {
  /** Restore the real global timers and `Date.now`. */
  uninstall(): void;
}

interface FakeTimer {
  id: number;
  fireAt: number;
  fn: () => void;
  interval?: number;
}

export function installFakeClock(startTime = 0): InstalledClock {
  let currentTime = startTime;
  let nextId = 1;
  const timers = new Map<number, FakeTimer>();

  const realTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  const realDateNow = Date.now;

  const schedule = (fn: () => void, ms: number, interval?: number): number => {
    const id = nextId;
    nextId += 1;
    timers.set(id, { id, fireAt: currentTime + Math.max(0, ms), fn, interval });
    return id;
  };
  const cancel = (id: number | undefined): void => {
    if (typeof id === 'number') {
      timers.delete(id);
    }
  };

  const fakeSetTimeout = (fn: () => void, ms = 0): number => schedule(fn, ms);
  const fakeSetInterval = (fn: () => void, ms = 0): number => {
    const every = Math.max(1, ms);
    return schedule(fn, every, every);
  };

  // Object.assign sidesteps the global timers' overloaded signatures without a cast.
  Object.assign(globalThis, {
    setTimeout: fakeSetTimeout,
    clearTimeout: cancel,
    setInterval: fakeSetInterval,
    clearInterval: cancel,
  });
  Object.assign(Date, { now: () => currentTime });

  function nextDue(target: number): FakeTimer | undefined {
    let due: FakeTimer | undefined;
    for (const timer of timers.values()) {
      if (timer.fireAt <= target && (due === undefined || timer.fireAt < due.fireAt)) {
        due = timer;
      }
    }
    return due;
  }

  async function advance(ms: number): Promise<void> {
    const target = currentTime + ms;
    for (let due = nextDue(target); due !== undefined; due = nextDue(target)) {
      currentTime = due.fireAt;
      if (due.interval === undefined) {
        timers.delete(due.id);
      } else {
        due.fireAt = currentTime + due.interval;
      }
      due.fn();
      // Let any promises the callback resolved settle before the next timer.
      await Promise.resolve();
    }
    currentTime = target;
  }

  function uninstall(): void {
    Object.assign(globalThis, realTimers);
    Object.assign(Date, { now: realDateNow });
  }

  return { now: () => currentTime, advance, uninstall };
}
