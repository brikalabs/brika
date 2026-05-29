/**
 * Unit tests for `useTimeFormatStore`. The hook drives
 * `useSyncExternalStore`; in SSR (`renderToString`) the snapshot path runs
 * and returns the `auto` default. We exercise `setPreference` against a
 * stubbed `localStorage` + `dispatchEvent` to cover the writer path.
 *
 * The browser-only `read` + `subscribe` helpers are intentionally not
 * driven here — `useSyncExternalStore` only calls them on a client render,
 * which would require a DOM (jsdom/happy-dom). The package has no DOM
 * dependency today, so those code paths remain uncovered in this suite.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { type UseTimeFormatResult, useTimeFormatStore } from './use-time-format';

interface ProbeProps {
  readonly onResult: (r: UseTimeFormatResult) => void;
}

function Probe({ onResult }: Readonly<ProbeProps>): ReactElement {
  const result = useTimeFormatStore();
  onResult(result);
  return <span>.</span>;
}

function renderProbe(): UseTimeFormatResult {
  let captured: UseTimeFormatResult | null = null;
  renderToString(
    <Suspense fallback={<span>loading</span>}>
      <Probe
        onResult={(r) => {
          captured = r;
        }}
      />
    </Suspense>
  );
  if (captured === null) {
    throw new Error('useTimeFormatStore did not yield a result');
  }
  return captured;
}

describe('useTimeFormatStore — SSR snapshot path', () => {
  test('defaults preference to "auto" and hour12 to undefined', () => {
    const result = renderProbe();
    expect(result.preference).toBe('auto');
    expect(result.hour12).toBeUndefined();
    expect(typeof result.setPreference).toBe('function');
  });
});

describe('useTimeFormatStore — setPreference writes to localStorage and fires a custom event', () => {
  type GlobalLike = Record<string, unknown>;
  const g = globalThis as GlobalLike;

  const storage = new Map<string, string>();
  const fakeLocalStorage = {
    getItem: (key: string): string | null => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };

  const events: Event[] = [];
  const listeners: Array<(e: Event) => void> = [];
  const fakeDispatchEvent = (event: Event): boolean => {
    events.push(event);
    for (const listener of listeners) {
      listener(event);
    }
    return true;
  };

  let savedWindow: unknown;
  let hadWindow: boolean;
  let savedLocalStorage: unknown;
  let hadLocalStorage: boolean;
  let savedDispatchEvent: unknown;

  beforeAll(() => {
    hadWindow = 'window' in g;
    savedWindow = g.window;
    g.window = g.window ?? {};

    hadLocalStorage = 'localStorage' in g;
    savedLocalStorage = g.localStorage;
    g.localStorage = fakeLocalStorage;

    savedDispatchEvent = g.dispatchEvent;
    g.dispatchEvent = fakeDispatchEvent;
  });

  afterEach(() => {
    storage.clear();
    events.length = 0;
    listeners.length = 0;
  });

  afterAll(() => {
    if (hadWindow) {
      g.window = savedWindow;
    } else {
      delete g.window;
    }
    if (hadLocalStorage) {
      g.localStorage = savedLocalStorage;
    } else {
      delete g.localStorage;
    }
    if (savedDispatchEvent === undefined) {
      delete g.dispatchEvent;
    } else {
      g.dispatchEvent = savedDispatchEvent;
    }
  });

  test('setPreference("h24") persists the value and dispatches a change event', () => {
    const result = renderProbe();
    result.setPreference('h24');

    expect(storage.get('i18n.timeFormat')).toBe('h24');
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('i18n.timeFormatChange');
  });

  test('setPreference("h12") persists and dispatches', () => {
    const result = renderProbe();
    result.setPreference('h12');

    expect(storage.get('i18n.timeFormat')).toBe('h12');
    expect(events.length).toBe(1);
  });

  test('setPreference("auto") clears any prior preference back to the default value', () => {
    const result = renderProbe();
    result.setPreference('auto');

    expect(storage.get('i18n.timeFormat')).toBe('auto');
    expect(events.length).toBe(1);
  });
});
