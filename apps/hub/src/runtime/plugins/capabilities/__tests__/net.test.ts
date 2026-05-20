import { describe, expect, mock, test } from 'bun:test';
import { CapabilityRegistry } from '@brika/capabilities';
import { buildNetCapabilities, isHostAllowed, matchesHostPattern } from '../net';

function makeReg(
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
) {
  const reg = new CapabilityRegistry();
  for (const cap of buildNetCapabilities({ fetch: fetchImpl })) {
    reg.register(cap);
  }
  return reg;
}

function makeCtx(allow: string[]) {
  return {
    pluginUid: 'p',
    pluginRoot: '/tmp/p',
    grantedScope: { allow },
    log: () => undefined,
  };
}

describe('matchesHostPattern', () => {
  test('exact host literal matches', () => {
    expect(matchesHostPattern('api.spotify.com', 'api.spotify.com')).toBe(true);
    expect(matchesHostPattern('api.spotify.com', 'spotify.com')).toBe(false);
  });

  test('one-level wildcard matches one or more sub-labels', () => {
    expect(matchesHostPattern('foo.googleapis.com', '*.googleapis.com')).toBe(true);
    expect(matchesHostPattern('a.b.googleapis.com', '*.googleapis.com')).toBe(true);
  });

  test('wildcard does NOT match the bare suffix host', () => {
    // *.googleapis.com must NOT match googleapis.com — that would silently
    // widen the allowlist past what the user granted.
    expect(matchesHostPattern('googleapis.com', '*.googleapis.com')).toBe(false);
  });
});

describe('isHostAllowed', () => {
  test('empty allow array denies every host', () => {
    expect(isHostAllowed('api.example.com', [])).toBe(false);
  });

  test('matches when at least one pattern matches', () => {
    expect(isHostAllowed('api.spotify.com', ['api.spotify.com', '*.googleapis.com'])).toBe(true);
  });
});

describe('net.fetch capability', () => {
  test('happy path returns serialized response', async () => {
    const reg = makeReg(
      async () =>
        new Response('hello', {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/plain' },
        })
    );
    const out = await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/path' },
      makeCtx(['api.example.com'])
    );
    expect(out).toMatchObject({
      status: 200,
      statusText: 'OK',
      body: 'hello',
    });
  });

  test('denies a host not on the allow list', async () => {
    const reg = makeReg(() => {
      throw new Error('fetch should not be called');
    });
    await expect(
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://attacker.com/' },
        makeCtx(['api.example.com'])
      )
    ).rejects.toMatchObject({
      code: 'HANDLER_THREW',
      message: expect.stringContaining('attacker.com'),
    });
  });

  test('forwards method/headers/body to fetch', async () => {
    let seenInit: RequestInit | undefined;
    const reg = makeReg(async (_input, init) => {
      seenInit = init;
      return new Response('', { status: 204 });
    });
    await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/',
        method: 'POST',
        headers: { 'x-test': 'yes' },
        body: 'payload',
      },
      makeCtx(['api.example.com'])
    );
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'x-test': 'yes' });
    expect(seenInit?.body).toBe('payload');
  });

  test('aborts when timeoutMs elapses', async () => {
    const reg = makeReg(
      async (_input, init) =>
        new Promise((_resolve, reject) => {
          // Resolve never; let the abort cancel.
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new Error('aborted'));
            });
          }
        })
    );
    await expect(
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/', timeoutMs: 10 },
        makeCtx(['api.example.com'])
      )
    ).rejects.toMatchObject({
      code: 'HANDLER_THREW',
      message: expect.stringContaining('aborted'),
    });
  });

  test('rejects timeoutMs above 5 minutes at spec validation', async () => {
    const reg = makeReg(async () => new Response('', { status: 200 }));
    await expect(
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/', timeoutMs: 600_000 },
        makeCtx(['api.example.com'])
      )
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
  });

  test('rejects a non-URL argument at the spec layer', async () => {
    const reg = makeReg(async () => new Response('', { status: 200 }));
    await expect(
      reg.dispatch('dev.brika.net.fetch', { url: 'not-a-url' }, makeCtx(['api.example.com']))
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
  });
});
