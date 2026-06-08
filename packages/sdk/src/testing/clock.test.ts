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
});
