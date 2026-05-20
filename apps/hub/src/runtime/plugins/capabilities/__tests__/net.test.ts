import { describe, expect, mock, test } from 'bun:test';
import { CapabilityRegistry } from '@brika/capabilities';
import {
  buildNetCapabilities,
  isHostAllowed,
  matchesHostPattern,
  parseRetryAfter,
} from '../net';

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
      code: 'INTERNAL',
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
      code: 'INTERNAL',
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
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  test('rejects a non-URL argument at the spec layer', async () => {
    const reg = makeReg(async () => new Response('', { status: 200 }));
    await expect(
      reg.dispatch('dev.brika.net.fetch', { url: 'not-a-url' }, makeCtx(['api.example.com']))
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('parseRetryAfter', () => {
  test('parses delta-seconds form', () => {
    expect(parseRetryAfter('5', 60_000)).toBe(5000);
    expect(parseRetryAfter('0', 60_000)).toBe(0);
  });

  test('clamps to the supplied max', () => {
    expect(parseRetryAfter('120', 10_000)).toBe(10_000);
  });

  test('parses HTTP-date form (relative to now)', () => {
    const future = new Date(Date.now() + 2000).toUTCString();
    const delay = parseRetryAfter(future, 60_000);
    expect(delay).toBeGreaterThan(1000);
    expect(delay).toBeLessThanOrEqual(2500);
  });

  test('returns 0 for missing / unparseable values', () => {
    expect(parseRetryAfter(null, 60_000)).toBe(0);
    expect(parseRetryAfter(undefined, 60_000)).toBe(0);
    expect(parseRetryAfter('garbage', 60_000)).toBe(0);
  });
});

describe('net.fetch — single-flight on GETs', () => {
  test('coalesces concurrent identical GETs into one upstream call', async () => {
    let calls = 0;
    let releaseFetch: (() => void) | undefined;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const fetchImpl = mock(async () => {
      calls++;
      await fetchGate;
      return new Response('hello', { status: 200, statusText: 'OK' });
    });
    const reg = makeReg(fetchImpl);

    const a = reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/x' },
      makeCtx(['api.example.com'])
    );
    const b = reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/x' },
      makeCtx(['api.example.com'])
    );

    // Both calls observe the same in-flight Promise.
    expect(calls).toBe(1);
    releaseFetch?.();
    const [resA, resB] = await Promise.all([a, b]);
    expect(resA).toMatchObject({ status: 200, body: 'hello' });
    expect(resB).toMatchObject({ status: 200, body: 'hello' });
    expect(calls).toBe(1);
  });

  test('does NOT coalesce when singleFlight is explicitly false', async () => {
    let calls = 0;
    const reg = makeReg(async () => {
      calls++;
      return new Response('', { status: 200 });
    });
    await Promise.all([
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/y', singleFlight: false },
        makeCtx(['api.example.com'])
      ),
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/y', singleFlight: false },
        makeCtx(['api.example.com'])
      ),
    ]);
    expect(calls).toBe(2);
  });

  test('does NOT coalesce non-GET methods', async () => {
    let calls = 0;
    const reg = makeReg(async () => {
      calls++;
      return new Response('', { status: 200 });
    });
    await Promise.all([
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/p', method: 'POST', body: 'x' },
        makeCtx(['api.example.com'])
      ),
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/p', method: 'POST', body: 'x' },
        makeCtx(['api.example.com'])
      ),
    ]);
    expect(calls).toBe(2);
  });

  test('treats case-different headers as the same request (RFC 7230)', async () => {
    let calls = 0;
    let releaseFetch: (() => void) | undefined;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const reg = makeReg(async () => {
      calls++;
      await fetchGate;
      return new Response('hi', { status: 200 });
    });

    const a = reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/case', headers: { 'Accept-Language': 'en' } },
      makeCtx(['api.example.com'])
    );
    const b = reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/case', headers: { 'accept-language': 'en' } },
      makeCtx(['api.example.com'])
    );

    expect(calls).toBe(1);
    releaseFetch?.();
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  test('clears the cache after settlement so subsequent calls re-fetch', async () => {
    let calls = 0;
    const reg = makeReg(async () => {
      calls++;
      return new Response('', { status: 200 });
    });
    await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/z' },
      makeCtx(['api.example.com'])
    );
    await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/z' },
      makeCtx(['api.example.com'])
    );
    expect(calls).toBe(2);
  });
});

describe('net.fetch — retry policy', () => {
  test('retries on 503 and reports the final attempt count', async () => {
    let calls = 0;
    const reg = makeReg(async () => {
      calls++;
      if (calls < 3) {
        return new Response('', { status: 503 });
      }
      return new Response('ok', { status: 200, statusText: 'OK' });
    });
    const out = (await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/r',
        retry: { maxAttempts: 5, respectRetryAfter: true, backoffMs: 1 },
      },
      makeCtx(['api.example.com'])
    )) as { status: number; attempts: number; body: string };
    expect(out).toMatchObject({ status: 200, body: 'ok', attempts: 3 });
    expect(calls).toBe(3);
  });

  test('does NOT retry on 400 (non-retryable status)', async () => {
    let calls = 0;
    const reg = makeReg(async () => {
      calls++;
      return new Response('bad', { status: 400 });
    });
    const out = (await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/q',
        retry: { maxAttempts: 5, respectRetryAfter: true, backoffMs: 1 },
      },
      makeCtx(['api.example.com'])
    )) as { status: number; attempts: number };
    expect(out).toMatchObject({ status: 400, attempts: 1 });
    expect(calls).toBe(1);
  });

  test('honors Retry-After header when respectRetryAfter is true', async () => {
    let calls = 0;
    const times: number[] = [];
    const start = Date.now();
    const reg = makeReg(async () => {
      times.push(Date.now() - start);
      calls++;
      if (calls === 1) {
        return new Response('', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return new Response('done', { status: 200 });
    });
    const out = (await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/ra',
        retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 5000 },
      },
      makeCtx(['api.example.com'])
    )) as { status: number; attempts: number };
    // Retry-After: 0 should win over the 5s backoff — second call ~immediately.
    expect(out.attempts).toBe(2);
    const first = times[0];
    const second = times[1];
    if (first === undefined || second === undefined) {
      throw new Error('expected two timestamps');
    }
    expect(second - first).toBeLessThan(500);
  });

  test('refuses to retry non-idempotent methods without an idempotencyKey', async () => {
    let calls = 0;
    const reg = makeReg(async () => {
      calls++;
      return new Response('', { status: 503 });
    });
    const out = (await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/p',
        method: 'POST',
        body: 'x',
        retry: { maxAttempts: 5, respectRetryAfter: true, backoffMs: 1 },
      },
      makeCtx(['api.example.com'])
    )) as { status: number; attempts: number };
    expect(out).toMatchObject({ status: 503, attempts: 1 });
    expect(calls).toBe(1);
  });

  test('retries non-idempotent methods when idempotencyKey is supplied', async () => {
    let calls = 0;
    let seenIdempotencyHeader: string | undefined;
    const reg = makeReg(async (_input, init) => {
      calls++;
      const headers = init?.headers as Record<string, string> | undefined;
      seenIdempotencyHeader = headers?.['Idempotency-Key'];
      if (calls < 2) {
        return new Response('', { status: 503 });
      }
      return new Response('ok', { status: 200 });
    });
    const out = (await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://api.example.com/p',
        method: 'POST',
        body: 'x',
        idempotencyKey: 'k-123',
        retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 1 },
      },
      makeCtx(['api.example.com'])
    )) as { status: number; attempts: number };
    expect(out).toMatchObject({ status: 200, attempts: 2 });
    expect(seenIdempotencyHeader).toBe('k-123');
  });
});
