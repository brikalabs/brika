import { describe, expect, test } from 'bun:test';
import {
  type NormalizedPress,
  PressTracker,
  pressFromCount,
  SWITCH_PRESS_EVENTS,
} from './press-tracker';

/** Deterministic fake clock: timers fire only when `advance()` passes them. */
function createFakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    schedule(fn: () => void, delayMs: number): number {
      nextId += 1;
      timers.set(nextId, { at: now + delayMs, fn });
      return nextId;
    },
    cancel(handle: number): void {
      timers.delete(handle);
    },
    advance(ms: number): void {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    pendingCount(): number {
      return timers.size;
    },
  };
}

function createHarness(delayMs = 400) {
  const clock = createFakeClock();
  const presses: { key: string; press: NormalizedPress }[] = [];
  const tracker = new PressTracker<number>({
    onPress: (key, press) => presses.push({ key, press }),
    delayMs,
    schedule: (fn, ms) => clock.schedule(fn, ms),
    cancel: (handle) => clock.cancel(handle),
  });
  return { clock, presses, tracker };
}

describe('PressTracker', () => {
  test('shortRelease followed by the timer emits a single short press', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'initialPress', { newPosition: '1' });
    tracker.handle('dev:30', 'shortRelease', { previousPosition: '1' });
    expect(presses).toHaveLength(0);

    clock.advance(400);
    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'short', count: 1 } }]);

    // Nothing else pending: advancing further emits nothing more.
    clock.advance(10_000);
    expect(presses).toHaveLength(1);
  });

  test('longPress emits long immediately and the trailing longRelease is ignored', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'initialPress', {});
    tracker.handle('dev:30', 'longPress', { newPosition: '1' });
    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'long', count: 1 } }]);

    tracker.handle('dev:30', 'longRelease', { previousPosition: '1' });
    clock.advance(10_000);
    expect(presses).toHaveLength(1);
  });

  test('multiPressComplete before the timer cancels it and emits a double', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'shortRelease', {});
    tracker.handle('dev:30', 'multiPressOngoing', { currentNumberOfPressesCounted: '2' });
    tracker.handle('dev:30', 'shortRelease', {});
    tracker.handle('dev:30', 'multiPressComplete', { totalNumberOfPressesCounted: '2' });

    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'double', count: 2 } }]);
    expect(clock.pendingCount()).toBe(0);

    clock.advance(10_000);
    expect(presses).toHaveLength(1);
  });

  test('multiPressComplete maps counts: 1=short, 3=triple, 5=multi', () => {
    const { presses, tracker } = createHarness();

    tracker.handle('a', 'multiPressComplete', { totalNumberOfPressesCounted: '1' });
    tracker.handle('b', 'multiPressComplete', { totalNumberOfPressesCounted: '3' });
    tracker.handle('c', 'multiPressComplete', { totalNumberOfPressesCounted: '5' });

    expect(presses).toEqual([
      { key: 'a', press: { press: 'short', count: 1 } },
      { key: 'b', press: { press: 'triple', count: 3 } },
      { key: 'c', press: { press: 'multi', count: 5 } },
    ]);
  });

  test('multiPressComplete without a pending timer still emits', () => {
    const { presses, tracker } = createHarness();

    tracker.handle('dev:30', 'multiPressComplete', { totalNumberOfPressesCounted: '2' });
    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'double', count: 2 } }]);
  });

  test('a malformed or missing count falls back to a single short press', () => {
    const { presses, tracker } = createHarness();

    tracker.handle('a', 'multiPressComplete', {});
    tracker.handle('b', 'multiPressComplete', { totalNumberOfPressesCounted: 'oops' });
    tracker.handle('c', 'multiPressComplete', { totalNumberOfPressesCounted: '0' });

    expect(presses).toEqual([
      { key: 'a', press: { press: 'short', count: 1 } },
      { key: 'b', press: { press: 'short', count: 1 } },
      { key: 'c', press: { press: 'short', count: 1 } },
    ]);
  });

  test('multiPressOngoing cancels the short timer so no spurious short fires', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'shortRelease', {});
    tracker.handle('dev:30', 'multiPressOngoing', {});
    clock.advance(10_000);
    expect(presses).toHaveLength(0);

    tracker.handle('dev:30', 'multiPressComplete', { totalNumberOfPressesCounted: '2' });
    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'double', count: 2 } }]);
  });

  test('a second shortRelease restarts the timer instead of stacking emissions', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'shortRelease', {});
    clock.advance(300);
    tracker.handle('dev:30', 'shortRelease', {});
    clock.advance(300);
    expect(presses).toHaveLength(0);

    clock.advance(100);
    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'short', count: 1 } }]);
  });

  test('longPress cancels a pending short timer', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'shortRelease', {});
    tracker.handle('dev:30', 'longPress', {});
    clock.advance(10_000);

    expect(presses).toEqual([{ key: 'dev:30', press: { press: 'long', count: 1 } }]);
  });

  test('keys are tracked independently', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'shortRelease', {});
    tracker.handle('dev:31', 'shortRelease', {});
    tracker.handle('dev:31', 'multiPressComplete', { totalNumberOfPressesCounted: '2' });
    clock.advance(400);

    expect(presses).toEqual([
      { key: 'dev:31', press: { press: 'double', count: 2 } },
      { key: 'dev:30', press: { press: 'short', count: 1 } },
    ]);
  });

  test('unknown events are ignored', () => {
    const { clock, presses, tracker } = createHarness();

    tracker.handle('dev:30', 'initialPress', {});
    tracker.handle('dev:30', 'somethingElse', {});
    clock.advance(10_000);

    expect(presses).toHaveLength(0);
  });

  test('honors a custom delay', () => {
    const { clock, presses, tracker } = createHarness(100);

    tracker.handle('dev:30', 'shortRelease', {});
    clock.advance(99);
    expect(presses).toHaveLength(0);
    clock.advance(1);
    expect(presses).toHaveLength(1);
  });
});

describe('pressFromCount', () => {
  test('maps counts to press types', () => {
    expect(pressFromCount(1)).toEqual({ press: 'short', count: 1 });
    expect(pressFromCount(2)).toEqual({ press: 'double', count: 2 });
    expect(pressFromCount(3)).toEqual({ press: 'triple', count: 3 });
    expect(pressFromCount(4)).toEqual({ press: 'multi', count: 4 });
    expect(pressFromCount(7)).toEqual({ press: 'multi', count: 7 });
  });
});

describe('SWITCH_PRESS_EVENTS', () => {
  test('covers the raw switch event vocabulary', () => {
    for (const event of [
      'initialPress',
      'shortRelease',
      'longPress',
      'longRelease',
      'multiPressOngoing',
      'multiPressComplete',
    ]) {
      expect(SWITCH_PRESS_EVENTS.has(event)).toBe(true);
    }
    expect(SWITCH_PRESS_EVENTS.has('lockOperation')).toBe(false);
  });
});
