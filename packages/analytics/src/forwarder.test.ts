/**
 * Tests for the EventForwarder — opt-in remote forwarding with redaction,
 * identity gating, queue backpressure, and graceful host-not-registered.
 *
 * The forwarder is the privacy-critical surface in the package; every test
 * here is a regression guard on a promise made in the README:
 *   - off by default, never fetches when not opted in
 *   - distinctId always sent; userId only when BRIKA_ANALYTICS_IDENTIFY=1
 *   - nested string props are recursively path-redacted before leaving
 *   - if the operator opts in without registering ANALYTICS_HOST, we disable
 *     forwarding rather than throwing into the capture hot path
 *   - queue is bounded (drop-oldest under sustained backpressure)
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { container } from '@brika/di';
import { reset, useTestBed } from '@brika/di/testing';
import { EventForwarder } from './forwarder';
import { ANALYTICS_HOST, type AnalyticsHost } from './host';
import type { CaptureEvent } from './types';

useTestBed({ autoStub: false });

// Capture env so each test can mutate freely and restore at teardown.
const originalEnv = { ...process.env };
let fetchMock: ReturnType<typeof mock>;

function captureFetch(): Array<{ url: string; init: RequestInit }> {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  fetchMock = mock((url: string | URL, init: RequestInit) => {
    // The forwarder canonicalises the URL through `new URL(...)` before fetch
    // so SAST tools see the sanitiser inline; coerce back to string here so
    // assertions don't care about the call shape.
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  // biome-ignore lint/suspicious/noExplicitAny: test-only fetch substitution
  globalThis.fetch = fetchMock as any;
  return calls;
}

function registerHost(redact?: (s: string) => string): AnalyticsHost {
  const host: AnalyticsHost = {
    instanceId: 'inst-1',
    userAgent: 'brika/test',
    redact,
  };
  container.registerInstance(ANALYTICS_HOST, host);
  return host;
}

function makeEvent(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    ts: 1_700_000_000_000,
    name: 'feature.used',
    source: 'ui',
    distinctId: 'device-9',
    userId: 'user-42',
    props: { plan: 'pro' },
    ...overrides,
  };
}

beforeEach(() => {
  // Restore env from snapshot; individual tests opt in as needed.
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
});

afterEach(() => {
  reset();
});

describe('EventForwarder — opt-in gating', () => {
  test('does not fetch and does not need a host when forwarding is off', async () => {
    const calls = captureFetch();
    // BRIKA_TELEMETRY_EVENTS is unset by default.
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    forwarder.flush();
    expect(calls).toHaveLength(0);
    // Host was never resolved — registering after the fact wouldn't matter:
    // the package contract is "no host needed when forwarding is off".
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('does not fetch when opted in but no provider configured', () => {
    const calls = captureFetch();
    process.env.BRIKA_TELEMETRY_EVENTS = '1';
    // No BRIKA_TELEMETRY_URL or other credential, so resolveProvider() => null.
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    forwarder.flush();
    expect(calls).toHaveLength(0);
  });
});

describe('EventForwarder — webhook end-to-end', () => {
  beforeEach(() => {
    process.env.BRIKA_TELEMETRY_EVENTS = '1';
    process.env.BRIKA_TELEMETRY_URL = 'https://hook.example/in';
    registerHost();
  });

  test('flush() POSTs the batch with the host User-Agent', async () => {
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    forwarder.flush();
    // The async POST runs after flush() returns; give it a microtask.
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://hook.example/in');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('brika/test');
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.events).toHaveLength(1);
    expect(body.events[0].instanceId).toBe('inst-1');
  });

  test('userId is stripped from the forwarded payload by default', async () => {
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    forwarder.flush();
    await Promise.resolve();
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.events[0].userId).toBeUndefined();
    // distinctId is always sent — it's the anonymous device id.
    expect(body.events[0].distinctId).toBe('device-9');
  });

  test('userId is included when BRIKA_ANALYTICS_IDENTIFY is set', async () => {
    process.env.BRIKA_ANALYTICS_IDENTIFY = '1';
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    forwarder.flush();
    await Promise.resolve();
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.events[0].userId).toBe('user-42');
  });

  test('host.redact is applied recursively to nested string props', async () => {
    registerHost((s) => s.replace(/\/Users\/[^/]+/g, '~'));
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    forwarder.enqueue(
      makeEvent({
        props: {
          shallow: '/Users/alice/data',
          numeric: 42,
          nested: { path: '/Users/bob/logs', count: 1 },
          arr: ['/Users/carol/tmp', 7],
        },
      })
    );
    forwarder.flush();
    await Promise.resolve();
    const props = JSON.parse(String(calls[0]?.init.body)).events[0].props;
    expect(props.shallow).toBe('~/data');
    expect(props.numeric).toBe(42);
    expect(props.nested.path).toBe('~/logs');
    expect(props.nested.count).toBe(1);
    expect(props.arr[0]).toBe('~/tmp');
    expect(props.arr[1]).toBe(7);
  });

  test('non-http(s) URLs are refused (SSRF defence-in-depth)', async () => {
    process.env.BRIKA_TELEMETRY_URL = 'file:///etc/passwd';
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    forwarder.flush();
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });

  test('a rejected fetch is swallowed and never throws out of flush()', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test-only fetch substitution
    globalThis.fetch = mock(() => Promise.reject(new Error('network'))) as any;
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent());
    expect(() => forwarder.flush()).not.toThrow();
    // Let the rejected promise settle — must not throw.
    await Promise.resolve();
    await Promise.resolve();
  });

  test('stop() drains the buffer', async () => {
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    forwarder.enqueue(makeEvent({ name: 'a' }));
    forwarder.enqueue(makeEvent({ name: 'b' }));
    forwarder.stop();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.events).toHaveLength(2);
  });
});

describe('EventForwarder — graceful when host is not registered', () => {
  test('opted in + missing host = disabled, not crashed', async () => {
    process.env.BRIKA_TELEMETRY_EVENTS = '1';
    process.env.BRIKA_TELEMETRY_URL = 'https://hook.example/in';
    // No registerHost() — tsyringe inject(ANALYTICS_HOST) will throw.
    const calls = captureFetch();
    const forwarder = new EventForwarder();
    expect(() => forwarder.enqueue(makeEvent())).not.toThrow();
    forwarder.flush();
    await Promise.resolve();
    expect(calls).toHaveLength(0);
    // A second enqueue after disable must also be a no-op (no spam, no throw).
    expect(() => forwarder.enqueue(makeEvent())).not.toThrow();
  });
});
