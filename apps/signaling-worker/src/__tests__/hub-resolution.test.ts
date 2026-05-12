import { describe, expect, it } from 'bun:test';
import { injectHubMeta, resolveHubFromUrl } from '../hub-resolution';

describe('resolveHubFromUrl — subdomain form', () => {
  it('resolves the hub name from <name>.hubs.brika.dev', () => {
    const u = new URL('https://maxime.hubs.brika.dev/dashboard');
    expect(resolveHubFromUrl(u)).toEqual({ hubName: 'maxime', restPath: '/dashboard' });
  });

  it('lowercases the hostname for the comparison', () => {
    const u = new URL('https://MAXIME.HUBS.BRIKA.DEV/');
    expect(resolveHubFromUrl(u)).toEqual({ hubName: 'maxime', restPath: '/' });
  });

  it('refuses a malformed hub-name segment', () => {
    expect(resolveHubFromUrl(new URL('https://x.hubs.brika.dev/'))).toBeNull(); // too short
    expect(resolveHubFromUrl(new URL('https://Bad_Name.hubs.brika.dev/'))).toBeNull();
  });

  it('refuses look-alike hostnames', () => {
    expect(resolveHubFromUrl(new URL('https://hubs.brika.dev.evil.com/'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://maxime-hubs.brika.dev/'))).toBeNull();
  });
});

describe('resolveHubFromUrl — path form', () => {
  it('resolves the hub name from hub.brika.dev/<name>', () => {
    const u = new URL('https://hub.brika.dev/maxime');
    expect(resolveHubFromUrl(u)).toEqual({ hubName: 'maxime', restPath: '/' });
  });

  it('keeps the rest of the path for sub-routes', () => {
    const u = new URL('https://hub.brika.dev/maxime/settings/remote-access');
    expect(resolveHubFromUrl(u)).toEqual({
      hubName: 'maxime',
      restPath: '/settings/remote-access',
    });
  });

  it('passes through asset paths under the hub prefix', () => {
    const u = new URL('https://hub.brika.dev/maxime/assets/index-abc.js');
    expect(resolveHubFromUrl(u)).toEqual({
      hubName: 'maxime',
      restPath: '/assets/index-abc.js',
    });
  });

  it('returns null for the bare host with no name', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/'))).toBeNull();
  });

  it('returns null for an invalid first segment', () => {
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/-bad/'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/UPPER/'))).toBeNull();
    expect(resolveHubFromUrl(new URL('https://hub.brika.dev/x/'))).toBeNull(); // too short
  });
});

describe('resolveHubFromUrl — unrelated hosts', () => {
  it('returns null for signaling.brika.dev (the coordinator host)', () => {
    expect(resolveHubFromUrl(new URL('https://signaling.brika.dev/v1/health'))).toBeNull();
  });

  it('returns null for the workers.dev fallback', () => {
    expect(
      resolveHubFromUrl(new URL('https://brika-signaling.maxscharwath.workers.dev/'))
    ).toBeNull();
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
