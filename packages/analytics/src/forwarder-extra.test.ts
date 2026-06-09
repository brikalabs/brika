/**
 * Supplementary tests for forwarder.ts — covers getForwardingStatus
 * (lines 65-72) and isEventTelemetryEnabled not covered by the main suite.
 */
import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { getForwardingStatus, isEventTelemetryEnabled } from './forwarder';

describe('getForwardingStatus', () => {
  test('returns disabled when opt-in env is absent', () => {
    const status = getForwardingStatus({});
    expect(status).toEqual({ enabled: false, provider: null });
  });

  test('returns disabled when opted in but no provider is configured', () => {
    // Opted in but BRIKA_TELEMETRY_URL is missing (no webhook URL).
    const status = getForwardingStatus({ BRIKA_TELEMETRY_EVENTS: '1' });
    expect(status).toEqual({ enabled: false, provider: null });
  });

  test('returns enabled with provider name when opted in and configured (webhook)', () => {
    const status = getForwardingStatus({
      BRIKA_TELEMETRY_EVENTS: '1',
      BRIKA_TELEMETRY_URL: 'https://hook.example/in',
    });
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('webhook');
  });

  test('returns enabled with provider name when opted in and configured (posthog)', () => {
    const status = getForwardingStatus({
      BRIKA_TELEMETRY_EVENTS: '1',
      BRIKA_ANALYTICS_PROVIDER: 'posthog',
      BRIKA_ANALYTICS_POSTHOG_KEY: 'phc_abc',
    });
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('posthog');
  });

  test('returns enabled with mixpanel provider when configured', () => {
    const status = getForwardingStatus({
      BRIKA_TELEMETRY_EVENTS: '1',
      BRIKA_ANALYTICS_PROVIDER: 'mixpanel',
      BRIKA_ANALYTICS_MIXPANEL_TOKEN: 'mp_tok',
    });
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('mixpanel');
  });

  test('returns enabled with segment provider when configured', () => {
    const status = getForwardingStatus({
      BRIKA_TELEMETRY_EVENTS: '1',
      BRIKA_ANALYTICS_PROVIDER: 'segment',
      BRIKA_ANALYTICS_SEGMENT_WRITE_KEY: 'seg_key',
    });
    expect(status.enabled).toBe(true);
    expect(status.provider).toBe('segment');
  });

  test('treats "true" as opt-in', () => {
    const status = getForwardingStatus({
      BRIKA_TELEMETRY_EVENTS: 'true',
      BRIKA_TELEMETRY_URL: 'https://hook.example/in',
    });
    expect(status.enabled).toBe(true);
  });
});

describe('isEventTelemetryEnabled', () => {
  test('returns false when opt-in is absent', () => {
    expect(isEventTelemetryEnabled({})).toBe(false);
  });

  test('returns false when opted in but provider is missing', () => {
    expect(isEventTelemetryEnabled({ BRIKA_TELEMETRY_EVENTS: '1' })).toBe(false);
  });

  test('returns true when opted in and provider is configured', () => {
    expect(
      isEventTelemetryEnabled({
        BRIKA_TELEMETRY_EVENTS: '1',
        BRIKA_TELEMETRY_URL: 'https://hook.example/in',
      })
    ).toBe(true);
  });
});
