/**
 * HubSession Durable Object — one instance per hub name.
 *
 * Owns the per-hub WebSockets (one hub-side, N client-side) via Cloudflare's
 * Hibernation API so an idle hub costs near zero CPU. All state-machine logic
 * — eviction, hub-offline error, client-routing, hub-gone teardown — lives in
 * the runtime-neutral {@link HubSessionState} from `@brika/remote-access-
 * protocol`. This file is the Cloudflare transport: it accepts upgrades,
 * persists per-socket attachments via `serializeAttachment` so they survive
 * hibernation, and forwards `webSocketMessage` / `webSocketClose` events
 * into the state.
 */

import {
  type AttachmentStore,
  CloudflareIceServerProvider,
  type HubSessionAttachment,
  HubSessionState,
  type WsLike,
} from '@brika/remote-access-protocol';
import type { Env } from './env';
import { clientIpFromRequest } from './rate-limit';

export class HubSession {
  readonly #state: DurableObjectState;
  readonly #env: Env;
  #session: HubSessionState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    this.#env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/internal/status') {
      const status = this.#sessionState().status();
      return Response.json({ name: url.searchParams.get('name') ?? '', ...status });
    }

    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    // Negotiate the subprotocol. Browsers (and our hub-side WS client) send
    // `Sec-WebSocket-Protocol: brika.v1[, bearer.<token>]`. RFC 6455 requires
    // the server to echo back exactly one of the offered protocols.
    const offered = request.headers.get('sec-websocket-protocol') ?? '';
    const acceptedProtocol = offered
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('brika.v'));

    if (url.pathname === '/v1/hub') {
      return await this.#acceptHub(this.#nameFromBearer(request) ?? '', acceptedProtocol);
    }
    if (url.pathname === '/v1/client') {
      return await this.#acceptClient(
        url.searchParams.get('hub') ?? '',
        acceptedProtocol,
        clientIpFromRequest(request),
        request.headers.get('user-agent') ?? undefined
      );
    }
    return new Response('Unknown upgrade endpoint', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.#sessionState().handleMessage(ws as WsLike, message);
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.#sessionState().handleClose(ws as WsLike);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    // Treat an error like a close. CF normally also delivers `webSocketClose`
    // for the same socket, but we don't rely on that: `handleClose` is
    // idempotent (it deletes the attachment, so a follow-up close finds none
    // and no-ops), and tearing down here guarantees a hub's clients are
    // released even if the close event never arrives.
    this.#sessionState().handleClose(ws as WsLike);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Lazily build the per-hub state machine. After a hibernation wake the DO
   * loses its in-memory state, so we re-hydrate from `getWebSockets()` — each
   * socket's `serializeAttachment` survived hibernation and tells us its role.
   *
   * NOTE: this rebuild-on-wake path (and the `serializeAttachment` /
   * `deserializeAttachment` bridge in `#attachmentStore`) cannot be unit-tested
   * without the Cloudflare runtime (miniflare). `HubSessionState` itself is
   * covered against a fake `AttachmentStore` in the protocol package; verify
   * the real hibernation cycle with a staging `wrangler deploy` smoke test.
   */
  #sessionState(): HubSessionState {
    if (this.#session) {
      return this.#session;
    }
    const session = new HubSessionState({
      ice: new CloudflareIceServerProvider({
        appId: this.#env.CF_REALTIME_APP_ID ?? '',
        token: this.#env.CF_REALTIME_APP_TOKEN ?? '',
      }),
      attachments: this.#attachmentStore(),
    });
    for (const ws of this.#state.getWebSockets()) {
      session.rehydrate(ws as WsLike);
    }
    this.#session = session;
    return session;
  }

  /**
   * Bridge `HubSessionState`'s attachment storage to CF's WebSocket
   * Hibernation API. `serializeAttachment` survives an unload/wake cycle.
   */
  #attachmentStore(): AttachmentStore {
    // Cast from the runtime-neutral `WsLike` to CF's `WebSocket` — the
    // Hibernation methods (`serializeAttachment` / `deserializeAttachment`)
    // are CF-specific and absent from the structural shape used elsewhere.
    // SonarLint S4325 flags these casts as unnecessary; it's a false
    // positive — without them the property lookups fail to typecheck.
    return {
      get: (ws) => {
        const raw = (ws as WebSocket).deserializeAttachment() as HubSessionAttachment | undefined; // NOSONAR S4325
        return raw ?? null;
      },
      set: (ws, attachment) => {
        (ws as WebSocket).serializeAttachment(attachment); // NOSONAR S4325
      },
      delete: () => {
        // No-op: the WebSocket is about to be removed from the DO's tracked
        // set, so the persisted attachment will go with it.
      },
    };
  }

  async #acceptHub(hubName: string, protocol: string | undefined): Promise<Response> {
    if (!hubName) {
      return new Response('name required', { status: 400 });
    }
    const { client, server } = newPair();
    this.#state.acceptWebSocket(server, ['hub']);
    this.#sessionState().attachHub(server as WsLike, hubName);
    return upgradeResponse(client, protocol);
  }

  async #acceptClient(
    hubName: string,
    protocol: string | undefined,
    clientIp: string | undefined,
    clientUserAgent: string | undefined
  ): Promise<Response> {
    if (!hubName) {
      return new Response('name required', { status: 400 });
    }
    const { client, server } = newPair();
    // The socket must be accepted before `attachClient` can use it: the
    // hub-offline path intentionally delivers a structured
    // `session.error{hub-offline}` frame + a clean `4003` close (rather than a
    // bare handshake failure), which requires an accepted socket. In that case
    // `attachClient` returns `null` having already closed the socket — CF then
    // drops the closed socket from the DO's tracked set, and the `!attachment`
    // guard in `HubSessionState.handleMessage` covers the narrow accept→close
    // window. So the 101 below is correct for both the online and offline
    // paths; the browser observes either a live channel or the error+close.
    // The standalone transport (`open` handler) behaves identically.
    this.#state.acceptWebSocket(server, ['client']);
    await this.#sessionState().attachClient(server as WsLike, {
      name: hubName,
      clientIp,
      clientUserAgent,
    });
    return upgradeResponse(client, protocol);
  }

  /**
   * Pull the hub name out of the bearer subprotocol. The Worker has already
   * validated the token and routed us to the right DO by `idFromName(name)`,
   * so we just need a non-empty label for the attachment.
   */
  #nameFromBearer(request: Request): string | null {
    const proto = request.headers.get('sec-websocket-protocol') ?? '';
    for (const part of proto.split(',')) {
      if (part.trim().startsWith('bearer.')) {
        return 'hub';
      }
    }
    return null;
  }
}

function newPair(): { client: WebSocket; server: WebSocket } {
  const pair = new WebSocketPair();
  return { client: pair[0], server: pair[1] };
}

function upgradeResponse(client: WebSocket, protocol: string | undefined): Response {
  const headers = new Headers();
  if (protocol) {
    headers.set('Sec-WebSocket-Protocol', protocol);
  }
  return new Response(null, { status: 101, webSocket: client, headers });
}
