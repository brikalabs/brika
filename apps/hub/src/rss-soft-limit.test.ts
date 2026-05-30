/**
 * Tests for RssSoftLimitMonitor — sustained per-plugin RSS breach detection.
 */

import { describe, expect, test } from 'bun:test';
import { RssSoftLimitMonitor } from '@/runtime/metrics/rss-soft-limit';

const MB = 1024 * 1024;

describe('RssSoftLimitMonitor', () => {
  test('under-limit samples never report a breach', () => {
    const monitor = new RssSoftLimitMonitor(100 * MB, 3);
    expect(monitor.enabled).toBe(true);

    let breaches = 0;
    for (let i = 0; i < 10; i++) {
      if (monitor.record(50 * MB)) {
        breaches++;
      }
    }
    expect(breaches).toBe(0);
  });

  test('a single over-limit spike does not breach (sustained required)', () => {
    const monitor = new RssSoftLimitMonitor(100 * MB, 3);

    expect(monitor.record(200 * MB)).toBe(false); // streak 1
    expect(monitor.record(200 * MB)).toBe(false); // streak 2
    // Drops back under the limit before the 3rd consecutive sample.
    expect(monitor.record(50 * MB)).toBe(false); // streak reset
    expect(monitor.record(200 * MB)).toBe(false); // streak 1 again
  });

  test('sustained over-limit reports a breach exactly once', () => {
    const monitor = new RssSoftLimitMonitor(100 * MB, 3);

    expect(monitor.record(200 * MB)).toBe(false); // streak 1
    expect(monitor.record(200 * MB)).toBe(false); // streak 2
    expect(monitor.record(200 * MB)).toBe(true); // streak 3 -> breach

    // Latches: further over-limit samples must not report again, so the
    // lifecycle issues exactly one restart request per monitor instance.
    let extra = 0;
    for (let i = 0; i < 5; i++) {
      if (monitor.record(300 * MB)) {
        extra++;
      }
    }
    expect(extra).toBe(0);
  });

  test('disabled monitor (limit 0) never breaches', () => {
    const monitor = new RssSoftLimitMonitor(0, 3);
    expect(monitor.enabled).toBe(false);

    let breaches = 0;
    for (let i = 0; i < 20; i++) {
      if (monitor.record(10_000 * MB)) {
        breaches++;
      }
    }
    expect(breaches).toBe(0);
  });

  test('breaches on the first over-limit sample when only one is required', () => {
    const monitor = new RssSoftLimitMonitor(100 * MB, 1);
    expect(monitor.record(101 * MB)).toBe(true);
    expect(monitor.record(101 * MB)).toBe(false); // latched
  });

  test('a sample exactly at the limit is not a breach', () => {
    const monitor = new RssSoftLimitMonitor(100 * MB, 1);
    expect(monitor.record(100 * MB)).toBe(false);
    expect(monitor.record(100 * MB + 1)).toBe(true);
  });

  test('consecutiveSamples is clamped to at least 1', () => {
    const monitor = new RssSoftLimitMonitor(100 * MB, 0);
    expect(monitor.record(200 * MB)).toBe(true);
  });
});
