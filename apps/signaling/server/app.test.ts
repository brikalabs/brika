import { beforeEach, describe, expect, it } from 'bun:test';
import { StaticIceServerProvider } from '@brika/remote-access-protocol';
import { createInMemoryClaimStore } from '@brika/remote-access-protocol/testing';
import { type AppDeps, buildApp } from './app';

const TICKET_SECRET = 'test-secret-please-rotate';

function emptyAssets(): AppDeps['assets'] {
  return { fetch: () => new Response('asset', { status: 200 }) };
}

function newDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  const claims = createInMemoryClaimStore();
  return {
    claims,
    ice: new StaticIceServerProvider(),
    ticketSecret: TICKET_SECRET,
    assets: emptyAssets(),
    hubUpgrade: () => Promise.resolve(new Response('hub-upgraded', { status: 101 })),
    clientUpgrade: () => Promise.resolve(new Response('client-upgraded', { status: 101 })),
    hubStatus: () => Promise.resolve({ hubOnline: false, activeSessions: 0 }),
    ...overrides,
  };
}

async function jsonPost(
  app: ReturnType<typeof buildApp>,
  path: string,
  body: unknown,
  init: RequestInit = {}
) {
  const req = new Request(`https://hub.brika.dev${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
    body: JSON.stringify(body),
    ...init,
  });
  return await app.fetch(req);
}

describe('buildApp — /v1/health', () => {
  it('returns ok + claim count', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await app.fetch(new Request('https://hub.brika.dev/v1/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, claims: 1 });
  });
});

describe('buildApp — /v1/hubs/claim', () => {
  it('mints a claim and returns token + recoveryCode', async () => {
    const app = buildApp(newDeps());
    const res = await jsonPost(app, '/v1/hubs/claim', { name: 'myhub' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; token: string; recoveryCode: string };
    expect(body.name).toBe('myhub');
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.recoveryCode.length).toBeGreaterThan(20);
  });

  it('rejects a forbidden Origin', async () => {
    const app = buildApp(newDeps());
    const res = await jsonPost(
      app,
      '/v1/hubs/claim',
      { name: 'myhub' },
      { headers: { Origin: 'https://evil.example' } }
    );
    expect(res.status).toBe(403);
  });

  it('rejects invalid name with 400', async () => {
    const app = buildApp(newDeps());
    const res = await jsonPost(app, '/v1/hubs/claim', { name: 'a' });
    expect(res.status).toBe(400);
  });

  it('returns 409 on a taken name', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(app, '/v1/hubs/claim', { name: 'myhub' });
    expect(res.status).toBe(409);
  });
});

describe('buildApp — recovery flow', () => {
  it('POST /v1/hubs/:name/recover with valid code mints new token', async () => {
    const deps = newDeps();
    const original = await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(app, '/v1/hubs/myhub/recover', {
      recoveryCode: original.recoveryCode,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; recoveryCode: string };
    expect(body.token).not.toBe(original.token);
    expect(body.recoveryCode).not.toBe(original.recoveryCode);
  });

  it('POST /v1/hubs/:name/recover with bad code → 401', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(app, '/v1/hubs/myhub/recover', { recoveryCode: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('POST /v1/hubs/:name/recovery (bearer-auth) mints a new recovery code', async () => {
    const deps = newDeps();
    const original = await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(
      app,
      '/v1/hubs/myhub/recovery',
      {},
      { headers: { Authorization: `Bearer ${original.token}` } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recoveryCode: string };
    expect(body.recoveryCode).not.toBe(original.recoveryCode);
  });
});

describe('buildApp — rotate + release', () => {
  it('rotate with valid bearer returns new token', async () => {
    const deps = newDeps();
    const minted = await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(
      app,
      '/v1/hubs/myhub/rotate',
      {},
      { headers: { Authorization: `Bearer ${minted.token}` } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).not.toBe(minted.token);
  });

  it('rotate with wrong bearer → 401', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(
      app,
      '/v1/hubs/myhub/rotate',
      {},
      { headers: { Authorization: 'Bearer nope' } }
    );
    expect(res.status).toBe(401);
  });

  it('DELETE with valid bearer releases the claim', async () => {
    const deps = newDeps();
    const minted = await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await app.fetch(
      new Request('https://hub.brika.dev/v1/hubs/myhub', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${minted.token}` },
      })
    );
    expect(res.status).toBe(200);
    expect(await deps.claims.get('myhub')).toBeNull();
  });

  it('DELETE with wrong bearer → 401 and keeps the claim', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await app.fetch(
      new Request('https://hub.brika.dev/v1/hubs/myhub', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer nope' },
      })
    );
    expect(res.status).toBe(401);
    expect(await deps.claims.get('myhub')).not.toBeNull();
  });
});

describe('buildApp — tickets', () => {
  it('mints a ticket for a known hub', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await jsonPost(app, '/v1/tickets', { hubName: 'myhub' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ticket: string; iceServers: unknown[] };
    expect(body.ticket.split('.')).toHaveLength(3);
    expect(body.iceServers.length).toBeGreaterThan(0);
  });

  it('404 on unknown hub', async () => {
    const app = buildApp(newDeps());
    const res = await jsonPost(app, '/v1/tickets', { hubName: 'doesntexist' });
    expect(res.status).toBe(404);
  });
});

describe('buildApp — hub status', () => {
  it('GET /v1/hubs/:name/status delegates to deps.hubStatus', async () => {
    const deps = newDeps({
      hubStatus: () => Promise.resolve({ hubOnline: true, activeSessions: 3 }),
    });
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await app.fetch(new Request('https://hub.brika.dev/v1/hubs/myhub/status'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'myhub', hubOnline: true, activeSessions: 3 });
  });

  it('404 on unknown hub', async () => {
    const app = buildApp(newDeps());
    const res = await app.fetch(new Request('https://hub.brika.dev/v1/hubs/nope/status'));
    expect(res.status).toBe(404);
  });
});

describe('buildApp — WS routes', () => {
  it('/v1/hub with valid bearer delegates to hubUpgrade', async () => {
    const deps = newDeps();
    const minted = await deps.claims.claim('myhub');
    let upgradedFor = '';
    const app = buildApp({
      ...deps,
      hubUpgrade: (name) => {
        upgradedFor = name;
        return Promise.resolve(new Response('ok', { status: 101 }));
      },
    });
    const res = await app.fetch(
      new Request('https://hub.brika.dev/v1/hub', {
        headers: { 'Sec-WebSocket-Protocol': `brika.v1, bearer.${minted.token}` },
      })
    );
    expect(res.status).toBe(101);
    expect(upgradedFor).toBe('myhub');
  });

  it('/v1/hub without bearer → 401', async () => {
    const app = buildApp(newDeps());
    const res = await app.fetch(
      new Request('https://hub.brika.dev/v1/hub', {
        headers: { 'Sec-WebSocket-Protocol': 'brika.v1' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('/v1/hub with unknown bearer → 401', async () => {
    const app = buildApp(newDeps());
    const res = await app.fetch(
      new Request('https://hub.brika.dev/v1/hub', {
        headers: { 'Sec-WebSocket-Protocol': 'brika.v1, bearer.nope' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('/v1/client with valid ticket delegates to clientUpgrade', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const ticketRes = await jsonPost(app, '/v1/tickets', { hubName: 'myhub' });
    const { ticket } = (await ticketRes.json()) as { ticket: string };
    const res = await app.fetch(
      new Request(`https://hub.brika.dev/v1/client?hub=myhub&ticket=${ticket}`)
    );
    expect(res.status).toBe(101);
  });

  it('/v1/client with forbidden origin → 403', async () => {
    const deps = newDeps();
    await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const ticketRes = await jsonPost(app, '/v1/tickets', { hubName: 'myhub' });
    const { ticket } = (await ticketRes.json()) as { ticket: string };
    const res = await app.fetch(
      new Request(`https://hub.brika.dev/v1/client?hub=myhub&ticket=${ticket}`, {
        headers: { Origin: 'https://evil.example' },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe('buildApp — rate limit hook', () => {
  it('returns 429 when deps.rateLimit returns a Response', async () => {
    const deps = newDeps({
      rateLimit: (_req, bucket) =>
        bucket === 'claim' ? new Response('limited', { status: 429 }) : null,
    });
    const app = buildApp(deps);
    const res = await jsonPost(app, '/v1/hubs/claim', { name: 'myhub' });
    expect(res.status).toBe(429);
  });

  it('rate-limits the /v1/hub WS upgrade via the connect bucket', async () => {
    const deps = newDeps({
      rateLimit: (_req, bucket) =>
        bucket === 'connect' ? new Response('limited', { status: 429 }) : null,
    });
    const minted = await deps.claims.claim('myhub');
    const app = buildApp(deps);
    const res = await app.fetch(
      new Request('https://hub.brika.dev/v1/hub', {
        headers: { 'Sec-WebSocket-Protocol': `brika.v1, bearer.${minted.token}` },
      })
    );
    expect(res.status).toBe(429);
  });
});

describe('buildApp — SPA fallback', () => {
  let assetsCalledWith: Request | null = null;
  beforeEach(() => {
    assetsCalledWith = null;
  });

  it('unknown path delegates to deps.assets.fetch', async () => {
    const app = buildApp(
      newDeps({
        assets: {
          fetch: (req) => {
            assetsCalledWith = req;
            return new Response('shell', {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            });
          },
        },
      })
    );
    const res = await app.fetch(new Request('https://hub.brika.dev/'));
    expect(res.status).toBe(200);
    expect(assetsCalledWith).not.toBeNull();
  });

  it('/v1/<unknown> returns 404 instead of falling through to assets', async () => {
    const app = buildApp(newDeps());
    const res = await app.fetch(new Request('https://hub.brika.dev/v1/anything'));
    expect(res.status).toBe(404);
  });
});
