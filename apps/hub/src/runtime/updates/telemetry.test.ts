/**
 * Telemetry opt-in tests — verify the two-key handshake (env opt-in
 * + embedded URL) and that emit failures are swallowed silently.
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { emitUpdateTelemetry, isTelemetryEnabled } from './telemetry';

describe('isTelemetryEnabled', () => {
  test('disabled by default — no env set', () => {
    expect(isTelemetryEnabled({})).toBe(false);
  });

  test('disabled when only opt-in is set (no URL embedded)', () => {
    expect(isTelemetryEnabled({ BRIKA_TELEMETRY_UPDATES: '1' })).toBe(false);
  });

  test('disabled when only URL is set (no opt-in)', () => {
    expect(isTelemetryEnabled({ BRIKA_TELEMETRY_URL: 'https://x.test' })).toBe(false);
  });

  test('enabled when both keys are set with truthy values', () => {
    expect(
      isTelemetryEnabled({ BRIKA_TELEMETRY_UPDATES: '1', BRIKA_TELEMETRY_URL: 'https://x.test' })
    ).toBe(true);
    expect(
      isTelemetryEnabled({
        BRIKA_TELEMETRY_UPDATES: 'true',
        BRIKA_TELEMETRY_URL: 'https://x.test',
      })
    ).toBe(true);
  });

  test('opt-in must be "1" or "true" (case-insensitive); other values are off', () => {
    expect(
      isTelemetryEnabled({ BRIKA_TELEMETRY_UPDATES: 'yes', BRIKA_TELEMETRY_URL: 'https://x.test' })
    ).toBe(false);
  });
});

describe('emitUpdateTelemetry', () => {
  const bun = useBunMock();

  test('no-op when telemetry is disabled — never touches fetch', async () => {
    let called = false;
    bun.fetch(() => {
      called = true;
      return Promise.resolve(new Response('{}'));
    });
    await emitUpdateTelemetry(
      {
        fromVersion: '0.5.0',
        toVersion: '0.6.0',
        channel: 'stable',
        outcome: 'success',
        durationMs: 1234,
      },
      {}
    );
    expect(called).toBe(false);
  });

  test('POSTs JSON when enabled', async () => {
    const captured: { url?: string; body?: string } = {};
    bun.fetch((url, init) => {
      // `emitUpdateTelemetry` always passes a string URL — narrow
      // explicitly rather than relying on Object.toString.
      let urlStr = '';
      if (typeof url === 'string') {
        urlStr = url;
      } else if (url instanceof URL) {
        urlStr = url.href;
      }
      captured.url = urlStr;
      captured.body = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(new Response('{}'));
    });
    await emitUpdateTelemetry(
      {
        fromVersion: '0.5.0',
        toVersion: '0.6.0',
        channel: 'canary',
        outcome: 'success',
        durationMs: 4321,
      },
      { BRIKA_TELEMETRY_UPDATES: '1', BRIKA_TELEMETRY_URL: 'https://x.test/telemetry' }
    );
    expect(captured.url).toBe('https://x.test/telemetry');
    const parsed = JSON.parse(captured.body ?? '{}');
    expect(parsed.outcome).toBe('success');
    expect(parsed.channel).toBe('canary');
    expect(typeof parsed.instanceId).toBe('string');
  });

  test('redacts the OS home directory from the reason field', async () => {
    const captured: { body?: string } = {};
    bun.fetch((_url, init) => {
      captured.body = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(new Response('{}'));
    });
    const home = require('node:os').homedir() as string;
    await emitUpdateTelemetry(
      {
        fromVersion: '0.5.0',
        toVersion: '0.6.0',
        channel: 'stable',
        outcome: 'failed',
        durationMs: 0,
        reason: `ENOENT: open '${home}/.brika/secrets.db.enc'`,
      },
      { BRIKA_TELEMETRY_UPDATES: '1', BRIKA_TELEMETRY_URL: 'https://x.test/telemetry' }
    );
    const parsed = JSON.parse(captured.body ?? '{}');
    expect(parsed.reason).not.toContain(home);
    expect(parsed.reason).toContain('~');
  });

  test('swallows network errors without throwing', async () => {
    bun.fetch(() => Promise.reject(new Error('connection refused')));
    await expect(
      emitUpdateTelemetry(
        {
          fromVersion: '0.5.0',
          toVersion: '0.6.0',
          channel: 'stable',
          outcome: 'failed',
          durationMs: 0,
        },
        { BRIKA_TELEMETRY_UPDATES: '1', BRIKA_TELEMETRY_URL: 'https://x.test/telemetry' }
      )
    ).resolves.toBeUndefined();
  });
});
