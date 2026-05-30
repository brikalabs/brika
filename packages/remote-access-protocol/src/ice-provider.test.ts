import { afterEach, beforeEach, describe, expect, it, type Mock, spyOn } from 'bun:test';
import {
  CloudflareIceServerProvider,
  NoneIceServerProvider,
  StaticIceServerProvider,
} from './ice-provider';
import { DEFAULT_ICE_SERVERS } from './signaling';

describe('StaticIceServerProvider', () => {
  it('empty input → DEFAULT_ICE_SERVERS', async () => {
    const provider = new StaticIceServerProvider();
    expect(await provider.iceServers()).toEqual(DEFAULT_ICE_SERVERS);
  });

  it('non-empty input → defaults + supplied servers', async () => {
    const extra = [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'c' }];
    const provider = new StaticIceServerProvider(extra);
    expect(await provider.iceServers()).toEqual([...DEFAULT_ICE_SERVERS, ...extra]);
  });
});

describe('NoneIceServerProvider', () => {
  it('returns empty array', async () => {
    expect(await new NoneIceServerProvider().iceServers()).toEqual([]);
  });
});

describe('CloudflareIceServerProvider', () => {
  let fetchSpy: Mock<typeof fetch>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, 'fetch') as unknown as Mock<typeof fetch>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('missing creds → defaults (no fetch)', async () => {
    const provider = new CloudflareIceServerProvider({ appId: '', token: '' });
    expect(await provider.iceServers()).toEqual(DEFAULT_ICE_SERVERS);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('success: object shape → defaults + parsed entry', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          iceServers: { urls: 'turn:turn.cf:3478', username: 'u', credential: 'c' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const provider = new CloudflareIceServerProvider({ appId: 'app', token: 'tok' });
    const result = await provider.iceServers();
    expect(result).toEqual([
      ...DEFAULT_ICE_SERVERS,
      { urls: 'turn:turn.cf:3478', username: 'u', credential: 'c' },
    ]);
  });

  it('success: array shape → defaults + parsed entries', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          iceServers: [
            { urls: ['turn:a:3478'], username: 'u1', credential: 'c1' },
            { urls: 'turn:b:3478', username: 'u2', credential: 'c2' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const provider = new CloudflareIceServerProvider({ appId: 'app', token: 'tok' });
    const result = await provider.iceServers();
    expect(result.length).toBe(DEFAULT_ICE_SERVERS.length + 2);
  });

  it('non-2xx → defaults only', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    const provider = new CloudflareIceServerProvider({ appId: 'app', token: 'tok' });
    expect(await provider.iceServers()).toEqual(DEFAULT_ICE_SERVERS);
  });

  it('network throw → defaults only (soft-fail)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('network down'));
    const provider = new CloudflareIceServerProvider({ appId: 'app', token: 'tok' });
    expect(await provider.iceServers()).toEqual(DEFAULT_ICE_SERVERS);
  });

  it('malformed body (no iceServers key) → defaults only', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ something: 'else' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const provider = new CloudflareIceServerProvider({ appId: 'app', token: 'tok' });
    expect(await provider.iceServers()).toEqual(DEFAULT_ICE_SERVERS);
  });
});
