/**
 * Integration tests for the React i18n bootstrap.
 *
 * `createI18n()` keeps a module-level singleton (both the `I18nClient` and the
 * global `i18next` instance). These tests build a single shared context once,
 * then exercise switchLanguage / hydrateTranslations / lazy-load against it.
 * The HTTP transport is stubbed so the suite never touches the network.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { realFetch } from '@brika/testing';
import i18n from 'i18next';
import { createI18n, hydrateTranslations, switchLanguage } from './client';

interface BundleResponse {
  body: Record<string, Record<string, unknown>>;
  etag: string;
}

interface FetchHarness {
  calls: string[];
  ifNoneMatch: Array<string | null>;
  /** Per-`<lang>/<ns>` payloads keyed as `"en/common"` for the per-namespace fallback. */
  fixtures: Map<string, unknown>;
  /** Per-key status overrides for the per-namespace endpoint; defaults to 200. */
  statuses: Map<string, number>;
  /** Per-locale bundle responses for `/api/i18n/bundle/:locale`. */
  bundles: Map<string, BundleResponse>;
}

const harness: FetchHarness = {
  calls: [],
  ifNoneMatch: [],
  fixtures: new Map(),
  statuses: new Map(),
  bundles: new Map(),
};

let savedWindow: unknown;
let hadWindow: boolean;

const toUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
};

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;

  const fakeFetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrl(input);
    harness.calls.push(url);
    const ifNoneMatch = init?.headers ? new Headers(init.headers).get('if-none-match') : null;
    harness.ifNoneMatch.push(ifNoneMatch);

    const bundleMatch = /\/api\/i18n\/bundle\/([^/]+)$/.exec(url);
    if (bundleMatch) {
      const locale = decodeURIComponent(bundleMatch[1] ?? '');
      const bundle = harness.bundles.get(locale);
      if (!bundle) {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      if (ifNoneMatch === bundle.etag) {
        return Promise.resolve(new Response(null, { status: 304 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(bundle.body), {
          status: 200,
          headers: { ETag: bundle.etag },
        })
      );
    }

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
  fakeFetch.preconnect = realFetch.preconnect;
  globalThis.fetch = fakeFetch;

  hadWindow = 'window' in g;
  savedWindow = g.window;
  g.window = g.window ?? {};

  // Seed bundle responses (primary path) plus per-namespace fixtures for the
  // fallback path's tests.
  harness.bundles.set('en', {
    etag: '"en-v1"',
    body: {
      common: { hello: 'Hello', shared: 'EN-shared' },
      layout: { title: 'Title' },
    },
  });
  harness.bundles.set('fr', {
    etag: '"fr-v1"',
    body: {
      common: { hello: 'Bonjour', shared: 'FR-shared' },
      layout: { title: 'Titre' },
    },
  });

  createI18n({
    apiPrefix: '/api/i18n',
    defaultNamespace: 'common',
    eagerNamespaces: ['layout'],
    fallbackLng: 'en',
  });

  // i18next.init resolves asynchronously after backend reads — wait for the
  // language detector + initial bundle fetch to settle before assertions.
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
  // Restore to the TRUE original (see @brika/testing#realFetch). Capturing
  // `globalThis.fetch` at beforeAll could grab another file's spy under
  // parallel `bun test` and re-install it on restore.
  globalThis.fetch = realFetch;
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

  test('boot fetches the bundle once and never hits the per-namespace endpoint for eager namespaces', () => {
    const bundleCalls = harness.calls.filter((u) => u.startsWith('/api/i18n/bundle/'));
    const nsCalls = harness.calls.filter(
      (u) => /^\/api\/i18n\/[^/]+\/[^/]+$/.test(u) && !u.includes('/bundle/')
    );
    expect(bundleCalls.length).toBeGreaterThanOrEqual(1);
    // Eager namespaces (`common`, `layout`) must come from the bundle, not
    // per-namespace round-trips.
    expect(nsCalls.some((u) => u.endsWith('/api/i18n/en/common'))).toBe(false);
    expect(nsCalls.some((u) => u.endsWith('/api/i18n/en/layout'))).toBe(false);
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
    expect(harness.calls).toHaveLength(before);
  });

  test('preloads via the bundle endpoint before flipping i18n.language', async () => {
    await switchLanguage('en');
    const callsBefore = harness.calls.length;

    await switchLanguage('fr');

    const newCalls = new Set(harness.calls.slice(callsBefore));
    // The eager namespaces (`common`, `layout`) are served by the bundle —
    // no per-namespace round-trip for either. Other lazily-registered
    // namespaces from prior tests may still go through the per-ns fallback;
    // that's the documented behavior and out of scope here.
    expect(newCalls.has('/api/i18n/bundle/fr')).toBe(true);
    expect(newCalls.has('/api/i18n/fr/common')).toBe(false);
    expect(newCalls.has('/api/i18n/fr/layout')).toBe(false);
    expect(i18n.language).toBe('fr');
    expect(i18n.t('hello')).toBe('Bonjour');
  });

  test('cimode bypasses the preload step but still flips the language', async () => {
    const before = harness.calls.length;
    await switchLanguage('cimode');
    expect(harness.calls).toHaveLength(before);
    expect(i18n.language).toBe('cimode');
    // Restore to a real language for subsequent tests.
    await switchLanguage('en');
  });

  test('swallows backend errors during preload so the switch still completes', async () => {
    harness.bundles.delete('de');
    await switchLanguage('en');

    await switchLanguage('de');

    expect(i18n.language).toBe('de');
  });
});

describe('hydrateTranslations', () => {
  test('pushes a multi-language tree into the i18next store without any HTTP', async () => {
    await switchLanguage('en');
    const callsBefore = harness.calls.length;

    hydrateTranslations({
      en: { common: { hello: 'Hi from HMR' } },
    });

    expect(harness.calls).toHaveLength(callsBefore);
    expect(i18n.getResource('en', 'common', 'hello')).toBe('Hi from HMR');
  });

  test('drops unsafe language codes silently', () => {
    // JSON.parse materialises `__proto__` as an own enumerable key — the
    // same shape a hostile out-of-band push could send.
    const malicious: Record<string, Record<string, Record<string, unknown>>> = JSON.parse(
      '{"__proto__":{"common":{"polluted":"yes"}}}'
    );
    hydrateTranslations(malicious);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('lazy-loading namespaces not in the bundle', () => {
  test('a namespace missing from the cached bundle triggers a bundle revalidation that returns it', async () => {
    await switchLanguage('en');
    // Namespace name unique to this test — the global i18next singleton is
    // shared with other test files, and a namespace already in the store
    // would short-circuit `loadNamespaces` before our backend is consulted.
    const ns = 'plugin:client-lazy';
    harness.bundles.set('en', {
      etag: '"en-with-lazy"',
      body: {
        common: { hello: 'Hello', shared: 'EN-shared' },
        layout: { title: 'Title' },
        [ns]: { greet: 'Yo' },
      },
    });
    const callsBefore = harness.calls.length;

    await i18n.loadNamespaces(ns);

    const newCalls = new Set(harness.calls.slice(callsBefore));
    expect(newCalls.has('/api/i18n/bundle/en')).toBe(true);
    // Per-namespace endpoint no longer exists — assert the loader didn't
    // try `/api/i18n/en/<ns>`.
    expect(newCalls.has(`/api/i18n/en/${encodeURIComponent(ns)}`)).toBe(false);
    expect(i18n.getResource('en', ns, 'greet')).toBe('Yo');
  });
});
