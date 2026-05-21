import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import i18n from 'i18next';
import { BundleNamespaceLoader, buildHttpBackend, type NamespaceLoader } from '../http-backend';

interface FetchCall {
  url: string;
  ifNoneMatch: string | null;
}

interface FetchHarness {
  calls: FetchCall[];
  set: (impl: (url: string, init?: RequestInit) => Promise<Response>) => void;
}

function installFetch(): FetchHarness {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  let impl: (url: string, init?: RequestInit) => Promise<Response> = () =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));

  const toUrl = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.href;
    }
    return input.url;
  };
  const fakeFetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrl(input);
    const ifNoneMatch = init?.headers ? new Headers(init.headers).get('if-none-match') : null;
    calls.push({ url, ifNoneMatch });
    return impl(url, init);
  }) as typeof fetch;
  fakeFetch.preconnect = original.preconnect;
  globalThis.fetch = fakeFetch;

  return {
    calls,
    set(next) {
      impl = next;
    },
  };
}

let savedFetch: typeof fetch;
let harness: FetchHarness;

beforeEach(async () => {
  savedFetch = globalThis.fetch;
  harness = installFetch();
  if (i18n.isInitialized) {
    await i18n.changeLanguage('en');
  } else {
    await i18n.init({ lng: 'en', fallbackLng: false, resources: {} });
  }
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

describe('BundleNamespaceLoader — bulk path', () => {
  test('first load() triggers a single bundle fetch and returns the requested namespace', async () => {
    harness.set(() =>
      Promise.resolve(
        new Response(JSON.stringify({ common: { hello: 'Hello' }, layout: { title: 'Title' } }), {
          status: 200,
          headers: { ETag: '"v1"' },
        })
      )
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    const result = await loader.load('en', 'common');
    expect(result).toEqual({ hello: 'Hello' });
    expect(harness.calls.length).toBe(1);
    expect(harness.calls[0]?.url).toBe('/api/i18n/bundle/en');
  });

  test('concurrent loads for different namespaces dedupe to one bundle fetch', async () => {
    const resolver: { fn: ((value: Response) => void) | null } = { fn: null };
    harness.set(
      () =>
        new Promise<Response>((resolve) => {
          resolver.fn = resolve;
        })
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    const p1 = loader.load('en', 'common');
    const p2 = loader.load('en', 'layout');
    const p3 = loader.load('en', 'settings');
    expect(harness.calls.length).toBe(1);
    resolver.fn?.(
      new Response(
        JSON.stringify({
          common: { hello: 'Hello' },
          layout: { title: 'T' },
          settings: { label: 'L' },
        }),
        { status: 200 }
      )
    );
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toEqual({ hello: 'Hello' });
    expect(r2).toEqual({ title: 'T' });
    expect(r3).toEqual({ label: 'L' });
    expect(harness.calls.length).toBe(1);
  });

  test('subsequent loads after a bundle fetch reuse the cache without new requests', async () => {
    harness.set(() =>
      Promise.resolve(
        new Response(JSON.stringify({ common: { k: 'v' } }), {
          status: 200,
          headers: { ETag: '"v1"' },
        })
      )
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'common');
    const callsBefore = harness.calls.length;
    await loader.load('en', 'common');
    expect(harness.calls.length).toBe(callsBefore);
  });

  test('revalidate sends If-None-Match and short-circuits on 304', async () => {
    let phase: 'initial' | 'revalidate' = 'initial';
    harness.set(() => {
      if (phase === 'initial') {
        phase = 'revalidate';
        return Promise.resolve(
          new Response(JSON.stringify({ common: { hello: 'Hello' } }), {
            status: 200,
            headers: { ETag: '"v1"' },
          })
        );
      }
      return Promise.resolve(new Response(null, { status: 304 }));
    });
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'common');
    const callsBefore = harness.calls.length;
    await loader.revalidate('en');
    expect(harness.calls.length).toBe(callsBefore + 1);
    expect(harness.calls[callsBefore]?.ifNoneMatch).toBe('"v1"');
  });

  test('revalidate hydrates i18next with fresh data when the ETag changes', async () => {
    let etag = '"v1"';
    let body = { common: { hello: 'Hello' } };
    harness.set(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { ETag: etag } }))
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'common');
    expect(i18n.getResource('en', 'common', 'hello')).toBe('Hello');
    etag = '"v2"';
    body = { common: { hello: 'Bonjour' } };
    await loader.revalidate('en');
    expect(i18n.getResource('en', 'common', 'hello')).toBe('Bonjour');
  });

  test('hydrate writes a pre-fetched bundle into the cache and i18next', () => {
    const loader = new BundleNamespaceLoader('/api/i18n');
    loader.hydrate('en', { common: { hello: 'Hi from HMR' } });
    expect(i18n.getResource('en', 'common', 'hello')).toBe('Hi from HMR');
  });

  test('5xx without a cached bundle rejects', async () => {
    harness.set(() => Promise.resolve(new Response('boom', { status: 500 })));
    const loader = new BundleNamespaceLoader('/api/i18n');
    await expect(loader.load('en', 'common')).rejects.toThrow(/Failed to load bundle for en: 500/);
  });

  test('50 parallel loads for distinct namespaces dedupe to exactly one fetch', async () => {
    const resolver: { fn: ((value: Response) => void) | null } = { fn: null };
    harness.set(
      () =>
        new Promise<Response>((resolve) => {
          resolver.fn = resolve;
        })
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    const namespaces = Array.from({ length: 50 }, (_, i) => `ns-${i}`);
    const fixture: Record<string, Record<string, unknown>> = {};
    for (const ns of namespaces) {
      fixture[ns] = { key: ns };
    }
    const pending = namespaces.map((ns) => loader.load('en', ns));
    // All 50 callers must coalesce on the same in-flight fetch — verify
    // BEFORE the fetch resolves, otherwise sequential reuse-from-cache
    // could hide a per-load duplicate fetch.
    expect(harness.calls.length).toBe(1);
    resolver.fn?.(new Response(JSON.stringify(fixture), { status: 200 }));
    const results = await Promise.all(pending);
    expect(results).toEqual(namespaces.map((ns) => ({ key: ns })));
    expect(harness.calls.length).toBe(1);
  });

  test('5xx after a cached bundle keeps serving the cache', async () => {
    let status = 200;
    harness.set(() =>
      Promise.resolve(
        status === 200
          ? new Response(JSON.stringify({ common: { hello: 'Hello' } }), {
              status: 200,
              headers: { ETag: '"v1"' },
            })
          : new Response('boom', { status: 500 })
      )
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'common');
    status = 500;
    await loader.revalidate('en');
    const result = await loader.load('en', 'common');
    expect(result).toEqual({ hello: 'Hello' });
  });
});

describe('BundleNamespaceLoader — prototype pollution defense', () => {
  test('strips __proto__ at the namespace level so a malicious bundle cannot pollute Object.prototype', async () => {
    // `JSON.parse` materialises `__proto__` as an own enumerable property,
    // so a server that returns `{"__proto__": {"polluted": true}, ...}` would
    // otherwise reach `Object.entries()` and i18next's resource store. The
    // loader sanitizes via `sanitizeTranslationTree` on the way in.
    const malicious = `{"__proto__":{"polluted":true},"common":{"hello":"Hi"}}`;
    harness.set(() => Promise.resolve(new Response(malicious, { status: 200 })));
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'common');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });

  test('strips __proto__ keys nested deep inside a translation tree', async () => {
    const malicious = `{"common":{"ui":{"__proto__":{"polluted":"deep"},"label":"Hi"}}}`;
    harness.set(() => Promise.resolve(new Response(malicious, { status: 200 })));
    const loader = new BundleNamespaceLoader('/api/i18n');
    const result = await loader.load('en', 'common');
    expect(result.ui).toBeDefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('BundleNamespaceLoader — missing-namespace revalidation', () => {
  test('a namespace missing from the cached bundle triggers one revalidation that returns it when the fresh bundle has it', async () => {
    let bundleBody: Record<string, Record<string, unknown>> = { common: { hello: 'Hello' } };
    harness.set(() =>
      Promise.resolve(
        new Response(JSON.stringify(bundleBody), {
          status: 200,
          // ETag changes between fetches so the conditional GET returns
          // 200 with the updated body rather than 304.
          headers: { ETag: `"v${Object.keys(bundleBody).length}"` },
        })
      )
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'common');
    const callsBefore = harness.calls.length;
    // Simulate the hub registering a new plugin namespace.
    bundleBody = { common: { hello: 'Hello' }, 'plugin:foo': { greet: 'Yo' } };
    const result = await loader.load('en', 'plugin:foo');
    expect(result).toEqual({ greet: 'Yo' });
    expect(harness.calls.length).toBe(callsBefore + 1);
  });

  test('still-missing after revalidation: subsequent loads return empty without re-fetching', async () => {
    harness.set(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { ETag: '"v1"' },
        })
      )
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    await loader.load('en', 'absent');
    const callsBefore = harness.calls.length;
    const result = await loader.load('en', 'absent');
    expect(result).toEqual({});
    expect(harness.calls.length).toBe(callsBefore);
  });

  test('revalidate restores a previously-missing namespace once it appears in the bundle', async () => {
    let bundleBody: Record<string, Record<string, unknown>> = {};
    harness.set(() =>
      Promise.resolve(
        new Response(JSON.stringify(bundleBody), {
          status: 200,
          headers: { ETag: `"v${Object.keys(bundleBody).length}"` },
        })
      )
    );
    const loader = new BundleNamespaceLoader('/api/i18n');
    // First lookup marks the namespace missing.
    expect(await loader.load('en', 'plugin:late')).toEqual({});
    // Hub registers the plugin; explicit revalidate hydrates i18next.
    bundleBody = { 'plugin:late': { greet: 'Yo' } };
    await loader.revalidate('en');
    // After revalidate, the namespace must resolve to real data without
    // another network call (the cache was updated in-place).
    const callsBefore = harness.calls.length;
    const result = await loader.load('en', 'plugin:late');
    expect(result).toEqual({ greet: 'Yo' });
    expect(harness.calls.length).toBe(callsBefore);
  });
});

describe('buildHttpBackend', () => {
  test('descriptor advertises the i18next-backend shape', () => {
    const loader = new BundleNamespaceLoader('/api');
    const backend = buildHttpBackend(loader);
    expect(backend.type).toBe('backend');
    expect(typeof backend.init).toBe('function');
    expect(typeof backend.read).toBe('function');
    expect(() => backend.init()).not.toThrow();
  });

  test('read() short-circuits to empty bundle for the cimode pseudo-locale', () => {
    const stub: NamespaceLoader = {
      load: () => {
        throw new Error('loader should not be invoked for cimode');
      },
    };
    const backend = buildHttpBackend(stub);
    const holder: { captured: { err: unknown; data: unknown } | null } = { captured: null };
    backend.read('cimode', 'common', (err, data) => {
      holder.captured = { err, data };
    });
    expect(holder.captured).toEqual({ err: null, data: {} });
  });

  test('read() forwards loader results via the i18next callback', async () => {
    const stub: NamespaceLoader = {
      load: () => Promise.resolve({ hello: 'Hi' }),
    };
    const backend = buildHttpBackend(stub);
    const result = await new Promise<{ err: unknown; data: Record<string, unknown> | boolean }>(
      (resolve) => {
        backend.read('en', 'common', (err, data) => resolve({ err, data }));
      }
    );
    expect(result.err).toBeNull();
    expect(result.data).toEqual({ hello: 'Hi' });
  });

  test('read() forwards loader rejections via the i18next callback', async () => {
    const error = new Error('network down');
    const stub: NamespaceLoader = { load: () => Promise.reject(error) };
    const backend = buildHttpBackend(stub);
    const result = await new Promise<{ err: unknown; data: Record<string, unknown> | boolean }>(
      (resolve) => {
        backend.read('en', 'common', (err, data) => resolve({ err, data }));
      }
    );
    expect(result.err).toBe(error);
    expect(result.data).toBe(false);
  });
});
