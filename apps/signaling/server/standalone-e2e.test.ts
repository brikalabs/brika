/**
 * End-to-end test of the standalone signaling server.
 *
 * Spins up the real `startStandalone` factory with an in-memory `ClaimStore`
 * and a no-op asset Fetcher, binds to an ephemeral port (`port: 0`), then
 * exercises the full flow over real Bun HTTP + WebSocket:
 *
 *   1. POST /v1/hubs/claim         → bearer token + recovery code
 *   2. WS /v1/hub (bearer)         → hub-side signaling channel
 *   3. POST /v1/tickets            → short-lived ticket
 *   4. WS /v1/client?hub&ticket    → client-side signaling channel
 *   5. session.iceServers on client → confirms hub-online path
 *   6. client.offer → session.offer on hub
 *   7. hub.answer  → session.answer on client
 *
 * No mocking of the WS layer, no `app.fetch(new Request(...))` short-circuit —
 * the kernel actually carries the packets between the test process and the
 * bound port. Catches regressions in the Bun.serve websocket wiring that
 * `app.test.ts`'s in-process router test wouldn't see.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PROTOCOL_VERSION } from '@brika/remote-access-protocol';
import { createInMemoryClaimStore } from '@brika/remote-access-protocol/testing';
import type { StandaloneEnv } from './env';
import { startStandalone } from './standalone';

type Server = Awaited<ReturnType<typeof startStandalone>>['server'];

const TICKET_SECRET = 'test-secret-please-rotate-32chars';

function newEnv(): StandaloneEnv {
  return {
    sqlitePath: ':memory:', // unused — claims overridden below
    turn: { kind: 'static', servers: [] },
    port: 0, // ephemeral — kernel assigns a free port
    host: '127.0.0.1',
    assetsDir: '/dev/null',
    maxHubs: 100,
    ticketSecret: TICKET_SECRET,
    allowedOrigins: undefined,
  };
}

let server: Server;
let baseHttp: string;
let baseWs: string;

beforeAll(async () => {
  ({ server } = await startStandalone(newEnv(), {
    claims: createInMemoryClaimStore(),
    // Asset fetcher is irrelevant for the API path under test; any 404 works
    // because nothing in this suite hits `/`.
    assets: { fetch: () => new Response('not used', { status: 404 }) },
  }));
  baseHttp = `http://127.0.0.1:${server.port}`;
  baseWs = `ws://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

// ─── WebSocket helpers ──────────────────────────────────────────────────────

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onErr = (e: Event): void => {
      cleanup();
      reject(e instanceof Error ? e : new Error(`WS error: ${e.type}`));
    };
    const cleanup = (): void => {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onErr);
    };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onErr);
  });
}

interface DecodedFrame {
  kind: string;
  [k: string]: unknown;
}

/** Read the next text frame from `ws`, JSON-parsed, with a generous timeout. */
function nextFrame(ws: WebSocket, timeoutMs = 2000): Promise<DecodedFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for WS frame after ${timeoutMs}ms`));
    }, timeoutMs);
    const onMsg = (e: MessageEvent): void => {
      cleanup();
      const raw = typeof e.data === 'string' ? e.data : '';
      try {
        resolve(JSON.parse(raw) as DecodedFrame);
      } catch (err) {
        reject(err as Error);
      }
    };
    const onErr = (e: Event): void => {
      cleanup();
      reject(e instanceof Error ? e : new Error(`WS error: ${e.type}`));
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      ws.removeEventListener('message', onMsg);
      ws.removeEventListener('error', onErr);
    };
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', onErr);
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('standalone server E2E (Bun.serve + real WS)', () => {
  it('responds to /v1/health over real HTTP', async () => {
    const res = await fetch(`${baseHttp}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('full claim → hub WS → client WS → offer/answer round-trip', async () => {
    // 1. Claim a hub name.
    const claimRes = await fetch(`${baseHttp}/v1/hubs/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'e2ehub' }),
    });
    expect(claimRes.status).toBe(200);
    const minted = (await claimRes.json()) as { token: string };
    expect(minted.token.length).toBeGreaterThan(20);

    // 2. Hub opens its long-lived signaling WS using the bearer subprotocol.
    const hubWs = new WebSocket(`${baseWs}/v1/hub`, ['brika.v1', `bearer.${minted.token}`]);
    await waitOpen(hubWs);

    try {
      // 3. Mint a client ticket.
      const ticketRes = await fetch(`${baseHttp}/v1/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubName: 'e2ehub' }),
      });
      expect(ticketRes.status).toBe(200);
      const { ticket } = (await ticketRes.json()) as { ticket: string };

      // 4. Client opens its session WS.
      const clientWs = new WebSocket(
        `${baseWs}/v1/client?hub=e2ehub&ticket=${encodeURIComponent(ticket)}`
      );
      await waitOpen(clientWs);

      try {
        // 5. Coordinator should push session.iceServers immediately.
        const iceFrame = await nextFrame(clientWs);
        expect(iceFrame.kind).toBe('session.iceServers');
        expect(Array.isArray(iceFrame.iceServers)).toBe(true);

        // 6. Client sends client.offer → hub should see session.offer.
        clientWs.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            kind: 'client.offer',
            hubName: 'e2ehub',
            sdp: 'v=0\r\noffer-sdp',
            ticket,
          })
        );
        const hubReceived = await nextFrame(hubWs);
        expect(hubReceived.kind).toBe('session.offer');
        expect(hubReceived.sdp).toBe('v=0\r\noffer-sdp');
        const sessionId = hubReceived.sessionId as string;
        expect(typeof sessionId).toBe('string');

        // 7. Hub answers → client should see session.answer with the same sdp.
        hubWs.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            kind: 'hub.answer',
            sessionId,
            sdp: 'v=0\r\nanswer-sdp',
          })
        );
        const clientReceived = await nextFrame(clientWs);
        expect(clientReceived.kind).toBe('session.answer');
        expect(clientReceived.sdp).toBe('v=0\r\nanswer-sdp');
        expect(clientReceived.sessionId).toBe(sessionId);
      } finally {
        clientWs.close();
      }
    } finally {
      hubWs.close();
    }
  });

  it('GET /v1/hubs/:name/status reflects the in-memory session', async () => {
    // Claim a fresh hub, connect it, then probe the status endpoint.
    const claimRes = await fetch(`${baseHttp}/v1/hubs/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'statushub' }),
    });
    const { token } = (await claimRes.json()) as { token: string };

    // Before the hub WS connects → offline.
    const offlineRes = await fetch(`${baseHttp}/v1/hubs/statushub/status`);
    expect(offlineRes.status).toBe(200);
    expect((await offlineRes.json()) as { hubOnline: boolean }).toMatchObject({
      hubOnline: false,
      activeSessions: 0,
    });

    const hubWs = new WebSocket(`${baseWs}/v1/hub`, ['brika.v1', `bearer.${token}`]);
    await waitOpen(hubWs);

    try {
      // After connect → online. The status read goes through deps.hubStatus →
      // the per-name HubSessionState that handles `/v1/hub` upgrades.
      const onlineRes = await fetch(`${baseHttp}/v1/hubs/statushub/status`);
      expect((await onlineRes.json()) as { hubOnline: boolean }).toMatchObject({
        hubOnline: true,
        activeSessions: 0,
      });
    } finally {
      hubWs.close();
    }
  });

  it('client WS with an invalid ticket is rejected with 401', async () => {
    // Use fetch with the WS upgrade headers to inspect the rejection status —
    // `new WebSocket(...)` swallows the handshake response.
    const res = await fetch(`${baseHttp}/v1/client?hub=anyone&ticket=not-real`, {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Key': 'dGVzdC1rZXktMTYtYnl0ZXM=',
        'Sec-WebSocket-Version': '13',
      },
    });
    expect(res.status).toBe(401);
  });
});
