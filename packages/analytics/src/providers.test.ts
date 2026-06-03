/**
 * Tests for analytics forwarder providers — the pure event→platform mappers.
 */
import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { type ForwardedEvent, resolveProvider, shouldIdentify } from './providers';

const event: ForwardedEvent = {
  instanceId: 'inst-1',
  ts: 1_700_000_000_000,
  name: 'feature.used',
  source: 'ui',
  pluginName: '@acme/widget',
  distinctId: 'device-9',
  userId: 'user-42',
  props: { plan: 'pro' },
};

describe('resolveProvider', () => {
  test('defaults to webhook and requires a URL', () => {
    expect(resolveProvider({})).toBeNull();
    const provider = resolveProvider({ BRIKA_TELEMETRY_URL: 'https://hook.example/in' });
    expect(provider?.name).toBe('webhook');
  });

  test('returns null when the selected provider is missing its credential', () => {
    expect(resolveProvider({ BRIKA_ANALYTICS_PROVIDER: 'posthog' })).toBeNull();
    expect(resolveProvider({ BRIKA_ANALYTICS_PROVIDER: 'mixpanel' })).toBeNull();
    expect(resolveProvider({ BRIKA_ANALYTICS_PROVIDER: 'segment' })).toBeNull();
    expect(resolveProvider({ BRIKA_ANALYTICS_PROVIDER: 'nope' })).toBeNull();
  });
});

describe('webhook provider', () => {
  test('wraps the batch under { events }', () => {
    const provider = resolveProvider({ BRIKA_TELEMETRY_URL: 'https://hook.example/in' });
    const req = provider?.buildRequest([event]);
    expect(req?.url).toBe('https://hook.example/in');
    expect(JSON.parse(req?.body ?? '{}')).toEqual({ events: [event] });
  });
});

describe('posthog provider', () => {
  test('maps to PostHog batch capture format', () => {
    const provider = resolveProvider({
      BRIKA_ANALYTICS_PROVIDER: 'posthog',
      BRIKA_ANALYTICS_POSTHOG_KEY: 'phc_123',
      BRIKA_ANALYTICS_POSTHOG_HOST: 'https://eu.posthog.com/',
    });
    const req = provider?.buildRequest([event]);
    expect(req?.url).toBe('https://eu.posthog.com/batch/');
    const body = JSON.parse(req?.body ?? '{}');
    expect(body.api_key).toBe('phc_123');
    expect(body.batch[0]).toMatchObject({
      event: 'feature.used',
      distinct_id: 'device-9',
      timestamp: new Date(event.ts).toISOString(),
    });
    expect(body.batch[0].properties).toMatchObject({
      plan: 'pro',
      source: 'ui',
      plugin: '@acme/widget',
      user_id: 'user-42',
    });
  });

  test('falls back to instance id when no device id is present', () => {
    const provider = resolveProvider({
      BRIKA_ANALYTICS_PROVIDER: 'posthog',
      BRIKA_ANALYTICS_POSTHOG_KEY: 'phc_123',
    });
    const req = provider?.buildRequest([{ ...event, distinctId: undefined }]);
    const body = JSON.parse(req?.body ?? '{}');
    expect(body.batch[0].distinct_id).toBe('inst-1');
  });
});

describe('mixpanel provider', () => {
  test('maps to a Mixpanel /track array with token + distinct_id', () => {
    const provider = resolveProvider({
      BRIKA_ANALYTICS_PROVIDER: 'mixpanel',
      BRIKA_ANALYTICS_MIXPANEL_TOKEN: 'mp_tok',
    });
    const req = provider?.buildRequest([event]);
    expect(req?.url).toContain('api.mixpanel.com/track');
    const body = JSON.parse(req?.body ?? '[]');
    expect(body[0].event).toBe('feature.used');
    expect(body[0].properties).toMatchObject({
      token: 'mp_tok',
      distinct_id: 'device-9',
      time: event.ts,
      $user_id: 'user-42',
    });
  });
});

describe('segment provider', () => {
  test('maps to a Segment batch track with basic auth', () => {
    const provider = resolveProvider({
      BRIKA_ANALYTICS_PROVIDER: 'segment',
      BRIKA_ANALYTICS_SEGMENT_WRITE_KEY: 'seg_key',
    });
    const req = provider?.buildRequest([event]);
    expect(req?.url).toBe('https://api.segment.io/v1/batch');
    expect(req?.headers.Authorization).toBe(`Basic ${btoa('seg_key:')}`);
    const body = JSON.parse(req?.body ?? '{}');
    expect(body.batch[0]).toMatchObject({
      type: 'track',
      event: 'feature.used',
      anonymousId: 'device-9',
      userId: 'user-42',
    });
  });
});

describe('shouldIdentify', () => {
  test('off by default, on when set', () => {
    expect(shouldIdentify({})).toBe(false);
    expect(shouldIdentify({ BRIKA_ANALYTICS_IDENTIFY: '1' })).toBe(true);
    expect(shouldIdentify({ BRIKA_ANALYTICS_IDENTIFY: 'true' })).toBe(true);
  });
});
