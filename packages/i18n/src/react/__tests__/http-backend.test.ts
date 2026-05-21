import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import i18n from 'i18next';
import { buildHttpBackend, HttpNamespaceLoader, type NamespaceLoader } from '../http-backend';

interface FetchCall {
  url: string;
}

interface FetchHarness {
  calls: FetchCall[];
  /** Resolve with an arbitrary `Response`. */
  set: (impl: (url: string) => Promise<Response>) => void;
}

function installFetch(): FetchHarness {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  let impl: (url: string) => Promise<Response> = () =>
    Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));

  const fakeFetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url });
    return impl(url);
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
  if (!i18n.isInitialized) {
    await i18n.init({ lng: 'en', fallbackLng: false, resources: {} });
  } else {
    await i18n.changeLanguage('en');
  }
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

describe('HttpNamespaceLoader', () => {
  test('parses JSON body and registers bundle with i18next', async () => {
    harness.set(() =>
      Promise.resolve(new Response(JSON.stringify({ hello: 'Hello' }), { status: 200 }))
    );
    const loader = new HttpNamespaceLoader('/api/i18n');
    const result = await loader.load('en', 'common');
    expect(result).toEqual({ hello: 'Hello' });
    expect(harness.calls[0]?.url).toBe('/api/i18n/en/common');
    expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
  });

  test('url-encodes the namespace', async () => {
    harness.set(() => Promise.resolve(new Response('{}', { status: 200 })));
    const loader = new HttpNamespaceLoader('/api');
    await loader.load('en', 'plugin/with space');
    expect(harness.calls[0]?.url).toBe('/api/en/plugin%2Fwith%20space');
  });

  test('404 marks the bundle as known-missing and resolves to {}', async () => {
    harness.set(() => Promise.resolve(new Response('', { status: 404 })));
    const loader = new HttpNamespaceLoader('/api');
    const result = await loader.load('en', 'absent');
    expect(result).toEqual({});
    expect(loader.hasKnownMissing('en:absent')).toBe(true);
  });

  test('known-missing returns immediately without re-fetching', async () => {
    harness.set(() => Promise.resolve(new Response('', { status: 404 })));
    const loader = new HttpNamespaceLoader('/api');
    await loader.load('en', 'absent');
    const callsBefore = harness.calls.length;
    const result = await loader.load('en', 'absent');
    expect(result).toEqual({});
    expect(harness.calls.length).toBe(callsBefore);
  });

  test('dedupes concurrent loads of the same key', async () => {
    const resolver: { fn: ((value: Response) => void) | null } = { fn: null };
    harness.set(
      () =>
        new Promise<Response>((resolve) => {
          resolver.fn = resolve;
        })
    );
    const loader = new HttpNamespaceLoader('/api');
    const p1 = loader.load('en', 'shared');
    const p2 = loader.load('en', 'shared');
    expect(harness.calls.length).toBe(1);
    resolver.fn?.(new Response(JSON.stringify({ k: 'v' }), { status: 200 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ k: 'v' });
    expect(r2).toEqual({ k: 'v' });
  });

  test('throws on 5xx response', async () => {
    harness.set(() => Promise.resolve(new Response('boom', { status: 500 })));
    const loader = new HttpNamespaceLoader('/api');
    await expect(loader.load('en', 'common')).rejects.toThrow(/Failed to load common for en: 500/);
  });

  test('throws when JSON body is not a record', async () => {
    harness.set(() => Promise.resolve(new Response(JSON.stringify(['not', 'a', 'record']))));
    const loader = new HttpNamespaceLoader('/api');
    await expect(loader.load('en', 'common')).rejects.toThrow();
  });

  test('forgetMissing returns true when the key was tracked, false otherwise', async () => {
    harness.set(() => Promise.resolve(new Response('', { status: 404 })));
    const loader = new HttpNamespaceLoader('/api');
    await loader.load('en', 'absent');
    expect(loader.forgetMissing('en:absent')).toBe(true);
    expect(loader.forgetMissing('en:absent')).toBe(false);
  });

  test('clear() drops both in-flight and known-missing sets', async () => {
    harness.set(() => Promise.resolve(new Response('', { status: 404 })));
    const loader = new HttpNamespaceLoader('/api');
    await loader.load('en', 'absent');
    expect(loader.hasKnownMissing('en:absent')).toBe(true);
    loader.clear();
    expect(loader.hasKnownMissing('en:absent')).toBe(false);
  });

  test('re-fetches after clear() drops the known-missing entry', async () => {
    let status = 404;
    harness.set(() => Promise.resolve(new Response('{}', { status })));
    const loader = new HttpNamespaceLoader('/api');
    await loader.load('en', 'absent');
    const callsAfterFirst = harness.calls.length;
    loader.clear();
    status = 200;
    await loader.load('en', 'absent');
    expect(harness.calls.length).toBe(callsAfterFirst + 1);
  });

  test('after success the in-flight slot is released so the next load refetches', async () => {
    harness.set(() => Promise.resolve(new Response(JSON.stringify({ a: 1 }), { status: 200 })));
    const loader = new HttpNamespaceLoader('/api');
    await loader.load('en', 'common');
    await loader.load('en', 'common');
    expect(harness.calls.length).toBe(2);
  });
});

describe('buildHttpBackend', () => {
  test('descriptor advertises the i18next-backend shape', () => {
    const loader = new HttpNamespaceLoader('/api');
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
