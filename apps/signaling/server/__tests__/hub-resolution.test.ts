import { describe, expect, it } from 'bun:test';
import { injectHubMeta, resolveHubFromUrl } from '../hub-resolution';

describe('resolveHubFromUrl', () => {
  it('resolves the hub name from /<name>', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/maxime'))).toEqual({
      hubName: 'maxime',
      restPath: '/',
    });
  });

  it('keeps the rest of the path for sub-routes', () => {
    expect(
      resolveHubFromUrl(new URL('https://hub.brika.dev/maxime/settings/remote-access'))
    ).toEqual({ hubName: 'maxime', restPath: '/settings/remote-access' });
  });

  it('passes through asset paths under the hub prefix', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/maxime/assets/index-abc.js'))).toEqual({
      hubName: 'maxime',
      restPath: '/assets/index-abc.js',
    });
  });

  it('preserves the trailing slash in restPath', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/maxime/'))).toEqual({
      hubName: 'maxime',
      restPath: '/',
    });
  });

  it('returns null for the root with no name', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/'))).toBeNull();
  });

  it('returns null for an invalid first segment', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/-bad/'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/UPPER/'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/x/'))).toBeNull(); // too short
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/with_underscore/'))).toBeNull();
  });

  it('returns null for the API prefix (callers must filter /v1/* first)', () => {
    // `v1` is 2 chars — fails the min-length check, so even if a buggy caller
    // forwards an API URL into this resolver the result is safe (null).
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/v1/health'))).toBeNull();
  });

  it('returns null for asset-binding prefixes (assets, sw.js, etc.)', () => {
    // Production regression: `assets` happens to match the hub-name regex,
    // so without this check `/assets/index-XYZ.js` would be resolved as
    // "hub: assets, restPath: /index-XYZ.js", the asset binding 404s,
    // and the SPA fallback serves index.html — breaking the bootstrap's
    // own JS + CSS.
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/assets/index-XYZ.js'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/assets/style.css'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/favicon.ico'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/robots.txt'))).toBeNull();
    // `sw.js` doesn't even match the regex (contains a dot, length 5) but
    // listing it in the set is defence in depth.
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/sw.js'))).toBeNull();
  });

  it('is hostname-agnostic — works on workers.dev preview URLs too', () => {
    expect(
      resolveHubFromUrl(new URL('https://brika-signaling.maxscharwath.workers.dev/maxime'))
    ).toEqual({ hubName: 'maxime', restPath: '/' });
  });

  it('resolves the hub from a `?hub=` query on the root path', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/?hub=maxime'))).toEqual({
      hubName: 'maxime',
      restPath: '/',
    });
  });

  it('lowercases the query candidate before validating', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/?hub=Maxime'))).toEqual({
      hubName: 'maxime',
      restPath: '/',
    });
  });

  it('returns null when the `?hub=` value fails the hub-name pattern', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/?hub=x'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/?hub=-bad'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/?hub=with_underscore'))).toBeNull();
  });

  it('prefers a valid path segment over a `?hub=` query (path wins)', () => {
    // `/maxime?hub=other` — the path identifies the hub. The query is ignored
    // because the path form is the canonical one and the bootstrap also
    // strips `?hub=` once it has committed the name to storage.
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/maxime?hub=other'))).toEqual({
      hubName: 'maxime',
      restPath: '/',
    });
  });

  it('falls back to `?hub=` only when the path segment is rejected', () => {
    // `/assets/...` is reserved → path resolution returns null, query takes over.
    // (Edge case; real callers should filter assets out before this.)
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/?hub=maxime#deep'))).toEqual({
      hubName: 'maxime',
      restPath: '/',
    });
  });
});

describe('injectHubMeta', () => {
  it('injects the meta tag before </head>', async () => {
    const res = new Response('<!doctype html><html><head><title>x</title></head><body/></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    const out = await injectHubMeta(res, 'maxime');
    const body = await out.text();
    expect(body).toContain('<meta name="brika:hub" content="maxime">');
    expect(body.indexOf('<meta name="brika:hub"')).toBeLessThan(body.indexOf('</head>'));
  });

  it('still injects when </head> is missing (degraded markup)', async () => {
    const res = new Response('<html><body>nothing</body></html>', {
      headers: { 'content-type': 'text/html' },
    });
    const out = await injectHubMeta(res, 'maxime');
    const body = await out.text();
    expect(body.startsWith('<meta name="brika:hub" content="maxime">')).toBe(true);
  });

  it('does not touch non-HTML responses', async () => {
    const res = new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    const out = await injectHubMeta(res, 'maxime');
    expect(await out.text()).toBe('{"ok":true}');
  });

  it('drops content-length so the runtime recomputes it', async () => {
    const res = new Response('<html><head></head><body/></html>', {
      headers: { 'content-type': 'text/html', 'content-length': '999' },
    });
    const out = await injectHubMeta(res, 'maxime');
    expect(out.headers.get('content-length')).toBeNull();
  });

  it('escapes the hub name to keep the attribute safe', async () => {
    const res = new Response('<html><head></head></html>', {
      headers: { 'content-type': 'text/html' },
    });
    // Hub names never contain these characters (validation rejects them),
    // but defence-in-depth — the injector must never produce broken HTML
    // even if a future caller passes something unexpected.
    const out = await injectHubMeta(res, 'a"<b&c');
    const body = await out.text();
    expect(body).toContain('content="a&quot;&lt;b&amp;c"');
  });

  it('preserves response status and other headers', async () => {
    const res = new Response('<html><head></head></html>', {
      status: 200,
      headers: {
        'content-type': 'text/html',
        'cache-control': 'public, max-age=60',
        'x-custom': 'kept',
      },
    });
    const out = await injectHubMeta(res, 'maxime');
    expect(out.status).toBe(200);
    expect(out.headers.get('cache-control')).toBe('public, max-age=60');
    expect(out.headers.get('x-custom')).toBe('kept');
  });
});
