import { afterEach, describe, expect, test } from 'bun:test';
import { type InstalledClock, installFakeClock } from './clock';

describe('installFakeClock', () => {
  let clock: InstalledClock | undefined;
  afterEach(() => {
    clock?.uninstall();
    clock = undefined;
  });

  test('fires a setInterval repeatedly as fake time advances', async () => {
    clock = installFakeClock();
    const ticks: number[] = [];
    setInterval(() => ticks.push(Date.now()), 1000);
    await clock.advance(3500);
    // Three firings inside the 3.5s window, each stamped with the fake clock.
    expect(ticks).toEqual([1000, 2000, 3000]);
  });

  test('clamps a zero interval to 1ms instead of busy-looping at 0', async () => {
    clock = installFakeClock();
    let count = 0;
    setInterval(() => {
      count += 1;
    }, 0);
    await clock.advance(3);
    expect(count).toBe(3);
  });

  test('clearTimeout with undefined id is a no-op', () => {
    clock = installFakeClock();
    // cancel(undefined) should not throw and should leave the queue intact.
    expect(() => {
      clearTimeout(undefined as unknown as number);
    }).not.toThrow();
  });

  test('clearInterval with undefined id is a no-op', () => {
    clock = installFakeClock();
    expect(() => {
      clearInterval(undefined as unknown as number);
    }).not.toThrow();
  });

  test('setTimeout fires at the correct fake time', async () => {
    clock = installFakeClock(1000);
    let firedAt = 0;
    setTimeout(() => {
      firedAt = Date.now();
    }, 500);
    await clock.advance(500);
    expect(firedAt).toBe(1500);
  });

  test('clearTimeout cancels a pending timer', async () => {
    clock = installFakeClock();
    let fired = false;
    const id = setTimeout(() => {
      fired = true;
    }, 100);
    clearTimeout(id);
    await clock.advance(200);
    expect(fired).toBe(false);
  });
});
