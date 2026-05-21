/**
 * Integration tests for the React i18n bootstrap.
 *
 * `createI18n()` keeps a module-level singleton (both the `I18nClient` and the
 * global `i18next` instance). These tests build a single shared context once,
 * then exercise switchLanguage / reloadTranslations / SSE-driven reactions
 * against it. All HTTP and EventSource transports are stubbed so the suite
 * never touches the network.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import i18n from 'i18next';
import { createI18n, reloadTranslations, switchLanguage } from '../client';

type Listener = (event: MessageEvent | Event) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  onopen: Listener | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(payload: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  close(): void {
    // Test fake — no resource to release.
  }
}

interface FetchHarness {
  calls: string[];
  /** Per-`<lang>/<ns>` payloads keyed as `"en/common"`. */
  fixtures: Map<string, unknown>;
  /** Per-key status overrides; defaults to 200. */
  statuses: Map<string, number>;
}

const harness: FetchHarness = {
  calls: [],
  fixtures: new Map(),
  statuses: new Map(),
};

let savedFetch: typeof fetch;
let savedEventSource: unknown;
let hadEventSource: boolean;
let savedWindow: unknown;
let hadWindow: boolean;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;

  savedFetch = globalThis.fetch;
  const fakeFetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    harness.calls.push(url);
    const match = /\/api\/i18n\/([^/]+)\/([^/]+)$/.exec(url);
    if (!match) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    const lang = match[1] ?? '';
    const ns = decodeURIComponent(match[2] ?? '');
    const fxKey = `${lang}/${ns}`;
    const status = harness.statuses.get(fxKey) ?? 200;
    if (status === 404) {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    if (status >= 400) {
      return Promise.resolve(new Response('', { status }));
    }
    const body = harness.fixtures.get(fxKey) ?? {};
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  fakeFetch.preconnect = savedFetch.preconnect;
  globalThis.fetch = fakeFetch;

  hadEventSource = 'EventSource' in g;
  savedEventSource = g.EventSource;
  g.EventSource = FakeEventSource;

  hadWindow = 'window' in g;
  savedWindow = g.window;
  g.window = g.window ?? {};

  // Seed a couple of bundles so the first switch has data to merge.
  harness.fixtures.set('en/common', { hello: 'Hello', shared: 'EN-shared' });
  harness.fixtures.set('fr/common', { hello: 'Bonjour', shared: 'FR-shared' });
  harness.fixtures.set('en/layout', { title: 'Title' });
  harness.fixtures.set('fr/layout', { title: 'Titre' });

  createI18n({
    apiPrefix: '/api/i18n',
    defaultNamespace: 'common',
    eagerNamespaces: ['layout'],
    fallbackLng: 'en',
  });

  // i18next.init resolves asynchronously after backend reads — wait for the
  // language detector + initial bundle fetches to settle before assertions.
  await new Promise<void>((resolve) => {
    if (i18n.isInitialized) {
      resolve();
      return;
    }
    i18n.on('initialized', () => resolve());
  });
  await i18n.loadNamespaces(['common', 'layout']);
});

afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  globalThis.fetch = savedFetch;
  if (hadEventSource) {
    g.EventSource = savedEventSource;
  } else {
    delete g.EventSource;
  }
  if (hadWindow) {
    g.window = savedWindow;
  } else {
    delete g.window;
  }
});

describe('createI18n', () => {
  test('initialises the global i18next instance', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.options.defaultNS).toBe('common');
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  test('starts the SSE event stream against the configured apiPrefix', () => {
    const urls = FakeEventSource.instances.map((s) => s.url);
    expect(urls).toContain('/api/i18n/events');
  });

  test('is idempotent — second call returns the same i18next instance', () => {
    const a = createI18n({ apiPrefix: '/should-be-ignored' });
    const b = createI18n();
    expect(a).toBe(b);
    expect(a).toBe(i18n);
  });
});

describe('switchLanguage', () => {
  test('no-op when target equals current language', async () => {
    const before = harness.calls.length;
    await switchLanguage(i18n.language);
    expect(harness.calls.length).toBe(before);
  });

  test('preloads namespaces before flipping i18n.language', async () => {
    await switchLanguage('en');
    const callsBefore = harness.calls.length;

    await switchLanguage('fr');

    // The preload must have hit the FR endpoints for the namespaces we knew
    // about. Once swapped, the active language has changed.
    const newCalls = harness.calls.slice(callsBefore);
    expect(newCalls.some((u) => u.startsWith('/api/i18n/fr/common'))).toBe(true);
    expect(i18n.language).toBe('fr');
    expect(i18n.t('hello')).toBe('Bonjour');
  });

  test('cimode bypasses the preload step but still flips the language', async () => {
    const before = harness.calls.length;
    await switchLanguage('cimode');
    expect(harness.calls.length).toBe(before);
    expect(i18n.language).toBe('cimode');
    // Restore to a real language for subsequent tests.
    await switchLanguage('en');
  });

  test('swallows backend errors during preload so the switch still completes', async () => {
    harness.statuses.set('fr/common', 500);
    await switchLanguage('en');

    await switchLanguage('fr');

    expect(i18n.language).toBe('fr');
    harness.statuses.delete('fr/common');
  });
});

describe('reloadTranslations', () => {
  test('clears loader state and re-fetches namespaces for the active language', async () => {
    await switchLanguage('en');
    const callsBefore = harness.calls.length;
    await reloadTranslations();
    const newCalls = harness.calls.slice(callsBefore);
    expect(newCalls.some((u) => u.includes('/api/i18n/en/common'))).toBe(true);
  });
});

describe('SSE registry change handling', () => {
  test('`clear` triggers a full reloadResources for the active language', async () => {
    await switchLanguage('en');
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'clear', namespace: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(harness.calls.length).toBeGreaterThan(callsBefore);
  });

  test('`remove` with a known namespace re-fetches it', async () => {
    await switchLanguage('en');
    await i18n.loadNamespaces('common');
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'remove', namespace: 'common' });
    await new Promise((r) => setTimeout(r, 20));
    const newCalls = harness.calls.slice(callsBefore);
    expect(newCalls.some((u) => u.includes('/api/i18n/en/common'))).toBe(true);
  });

  test('`remove` for an unknown namespace is ignored', async () => {
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'remove', namespace: 'never-loaded-ns' });
    await new Promise((r) => setTimeout(r, 20));
    expect(harness.calls.length).toBe(callsBefore);
  });

  test('`set` with a namespace already in the store triggers a refetch', async () => {
    await switchLanguage('en');
    await i18n.loadNamespaces('common');
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'set', namespace: 'common', locale: 'en' });
    await new Promise((r) => setTimeout(r, 20));
    const newCalls = harness.calls.slice(callsBefore);
    expect(newCalls.some((u) => u.includes('/api/i18n/en/common'))).toBe(true);
  });

  test('`set` for a different locale than the active one is ignored', async () => {
    await switchLanguage('en');
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'set', namespace: 'common', locale: 'de' });
    await new Promise((r) => setTimeout(r, 20));
    expect(harness.calls.length).toBe(callsBefore);
  });

  test('`set` without a namespace is ignored', async () => {
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'set', namespace: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(harness.calls.length).toBe(callsBefore);
  });

  test('`set` for a previously-missing namespace re-fetches and registers it', async () => {
    await switchLanguage('en');
    harness.statuses.set('en/lazy', 404);
    await i18n.loadNamespaces('lazy');
    // Now the namespace is known-missing. Flip it to "present" and notify.
    harness.statuses.delete('en/lazy');
    harness.fixtures.set('en/lazy', { greet: 'Hi' });
    const callsBefore = harness.calls.length;
    FakeEventSource.instances[0]?.emit({ kind: 'set', namespace: 'lazy', locale: 'en' });
    await new Promise((r) => setTimeout(r, 20));
    const newCalls = harness.calls.slice(callsBefore);
    expect(newCalls.some((u) => u.includes('/api/i18n/en/lazy'))).toBe(true);
  });
});
