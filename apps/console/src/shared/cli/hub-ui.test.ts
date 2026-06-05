/**
 * `hub-ui` waits for the hub to answer /api/health before opening the
 * browser. `pingHub` is driven by a mocked `fetch` and `openBrowser` by
 * a mocked `Bun.spawn`, so nothing real is launched.
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { openHubUi, openHubUiWhenReady, waitForHub } from './hub-ui';

describe('waitForHub', () => {
  const bun = useBunMock();

  test('returns true when the hub answers immediately', async () => {
    bun.fetch(async () => new Response('ok', { status: 200 }));
    expect(await waitForHub(100, 5)).toBe(true);
  });

  test('keeps polling until the hub answers', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('connection refused');
      }
      return new Response('ok', { status: 200 });
    });
    expect(await waitForHub(500, 5)).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  test('returns false when the hub never answers before the timeout', async () => {
    bun.fetch(async () => {
      throw new Error('connection refused');
    });
    expect(await waitForHub(30, 5)).toBe(false);
  });
});

describe('openHubUi', () => {
  const bun = useBunMock();

  test('spawns the browser opener without throwing', () => {
    bun.spawn({ exitCode: 0 });
    expect(() => openHubUi()).not.toThrow();
  });
});

describe('openHubUiWhenReady', () => {
  const bun = useBunMock();

  test('opens the UI once the hub is ready', async () => {
    bun.fetch(async () => new Response('ok', { status: 200 }));
    bun.spawn({ exitCode: 0 });
    expect(await openHubUiWhenReady()).toBe(true);
  });
});
