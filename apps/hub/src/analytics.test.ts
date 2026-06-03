/**
 * Tests for the Analytics capture service.
 */
import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { get, reset, useTestBed } from '@brika/di/testing';
import { Analytics, ScopedAnalytics } from '@/runtime/analytics/analytics';
import type { CaptureEvent } from '@/runtime/analytics/types';

useTestBed({ autoStub: true });

describe('Analytics', () => {
  let analytics: Analytics;

  beforeEach(() => {
    reset();
    analytics = get(Analytics);
  });

  test('capture fans out to subscribers with the default source', () => {
    const events: CaptureEvent[] = [];
    analytics.subscribe((e) => events.push(e));

    analytics.capture('feature.used', { plan: 'pro' });

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('feature.used');
    expect(events[0]?.source).toBe('hub');
    expect(events[0]?.props).toEqual({ plan: 'pro' });
  });

  test('ignores empty event names', () => {
    const events: CaptureEvent[] = [];
    analytics.subscribe((e) => events.push(e));

    analytics.capture('');

    expect(events).toHaveLength(0);
  });

  test('records recent events in the ring buffer', () => {
    analytics.capture('a');
    analytics.capture('b');

    const recent = analytics.recent();
    expect(recent.map((e) => e.name)).toEqual(['a', 'b']);
  });

  test('setEnabled(false) suppresses capture', () => {
    const events: CaptureEvent[] = [];
    analytics.subscribe((e) => events.push(e));

    analytics.setEnabled(false);
    analytics.capture('blocked');

    expect(events).toHaveLength(0);
    expect(analytics.isEnabled()).toBe(false);
  });

  test('options.source overrides the default', () => {
    const events: CaptureEvent[] = [];
    analytics.subscribe((e) => events.push(e));

    analytics.capture('x', undefined, { source: 'ui', distinctId: 'sess-1' });

    expect(events[0]?.source).toBe('ui');
    expect(events[0]?.distinctId).toBe('sess-1');
  });

  describe('withSource', () => {
    test('returns a scoped handle that presets the source', () => {
      const events: CaptureEvent[] = [];
      analytics.subscribe((e) => events.push(e));

      const scoped = analytics.withSource('plugin');
      expect(scoped).toBeInstanceOf(ScopedAnalytics);

      scoped.capture('plugin.thing', undefined, { pluginName: '@a/b' });
      expect(events[0]?.source).toBe('plugin');
      expect(events[0]?.pluginName).toBe('@a/b');
    });
  });
});
