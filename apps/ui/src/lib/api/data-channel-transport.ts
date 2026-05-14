/**
 * Transport that tunnels HTTP requests over a single WebRTC data channel to
 * a Brika hub. Application data never transits the coordinator: after the
 * SDP/ICE handshake completes, traffic flows peer-to-peer.
 *
 * Lifecycle:
 *   1. `connect()` opens a WebSocket to the coordinator (`/v1/client`).
 *      Authenticated via a short-lived ticket fetched from `/v1/tickets`.
 *   2. The coordinator pushes ICE servers and forwards a `session.offer`
 *      placeholder — but in our flow the *client* creates the offer first.
 *      Specifically: we wait for the `session.iceServers` push, build a
 *      `RTCPeerConnection`, open a data channel labeled `brika.rpc`, and
 *      emit our offer.
 *   3. The hub answers, ICE candidates trickle through the WS, and the data
 *      channel opens.
 *   4. `fetch()` encodes the request as a {@link RequestMessage}, sends it
 *      over the channel, and assembles the streamed response back via
 *      {@link ResponseAssembler}.
 *
 * Reconnect: on any unrecoverable failure (channel closed, ICE failed, WS
 * closed), the transport tears down and reconnects with backoff. In-flight
 * requests fail with a typed `TransportError`.
 */

import {
  type AbortMessage,
  DEFAULT_ICE_SERVERS,
  decodeRpc,
  decodeSignaling,
  encodeRpc,
  encodeSignaling,
  type IceServer,
  PROTOCOL_VERSION,
  type RequestMessage,
  ResponseAssembler,
  type ResponseHeadMessage,
  requestToFrames,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import { CookieJar } from './cookie-jar';
import type { Transport } from './transport';

export interface DataChannelTransportOptions {
  /** Hub name to connect to (resolved by the bootstrap from localStorage / meta / `?hub=`). */
  readonly hubName: string;
  /** Coordinator HTTP origin, e.g. `https://api.brika.dev`. */
  readonly coordinatorOrigin: string;
  /** Canonical public origin for the hub (used as Request base URL). */
  readonly hubOrigin: string;
  /** Optional callback for state-change notifications (idle/connecting/...). */
  readonly onStateChange?: (state: DataChannelTransportState) => void;
}

export type DataChannelTransportState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

export class TransportError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
  }
}

interface Inflight {
  readonly assembler: ResponseAssembler;
  readonly resolve: (res: Response) => void;
  readonly reject: (err: Error) => void;
  /** Whether response.head has already been observed. */
  headSeen: boolean;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Lightweight transport tracer.
 *
 * Off by default. Enable in devtools with:
 *   localStorage.setItem('brika.debug.rpc', '1')   // then reload
 *
 * When enabled, every outbound RPC request and inbound response frame logs
 * to the console under the `[brika.rpc]` tag — filterable in devtools.
 * Useful for diagnosing remote-access issues without redeploying.
 *
 * The check is cached at module load (single `localStorage.getItem` call)
 * to keep production paths to a single boolean read per call.
 */
const RPC_DEBUG_KEY = 'brika.debug.rpc';
const RPC_DEBUG_ENABLED = readDebugFlag();

function readDebugFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(RPC_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function debug(event: string, data?: Record<string, unknown>): void {
  if (!RPC_DEBUG_ENABLED) {
    return;
  }
  // biome-ignore lint/suspicious/noConsole: opt-in diagnostic surface
  const log = globalThis.console.debug.bind(globalThis.console);
  if (data === undefined) {
    log('[brika.rpc]', event);
  } else {
    log('[brika.rpc]', event, data);
  }
}

export class DataChannelTransport implements Transport {
  readonly kind = 'data-channel' as const;
  readonly #options: DataChannelTransportOptions;

  #state: DataChannelTransportState = 'idle';
  #closed = false;
  #reconnectAttempt = 0;
  #connectPromise: Promise<void> | null = null;

  #ws: WebSocket | null = null;
  #pc: RTCPeerConnection | null = null;
  #channel: RTCDataChannel | null = null;
  #sessionId: string | null = null;
  #nextRequestId = 1;
  readonly #inflight = new Map<number, Inflight>();
  readonly #cookies: CookieJar;
  /**
   * ICE candidates that arrive from the hub before its answer SDP has been
   * applied. Queued here, then flushed once `setRemoteDescription` completes
   * — `addIceCandidate` throws InvalidStateError if called earlier.
   */
  #pendingRemoteIce: RTCIceCandidateInit[] = [];
  #remoteDescriptionApplied = false;
  /**
   * Local ICE candidates emitted by the gathering ICE agent before the
   * coordinator's `session.answer` arrives. `#sessionId` is null until then,
   * so we can't build a `client.ice` frame yet; queue and flush once the
   * sessionId lands. Symmetric to `#pendingRemoteIce` for the inbound side.
   */
  #pendingLocalIce: RTCIceCandidateInit[] = [];

  constructor(options: DataChannelTransportOptions) {
    this.#options = options;
    // Scope the jar to the hub name so switching hubs cannot reuse another
    // hub's cookies. The `clearStaleHubJars` sweep drops anything not bound
    // to the current hub from sessionStorage.
    this.#cookies = new CookieJar({ hubName: options.hubName });
  }

  get state(): DataChannelTransportState {
    return this.#state;
  }

  close(): void {
    this.#closed = true;
    this.#teardown('transport-closed', 'Transport closed by caller');
    this.#setState('closed');
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this.#closed) {
      throw new TransportError('closed', 'Transport is closed');
    }
    await this.#ensureConnected();
    if (!this.#channel || this.#channel.readyState !== 'open') {
      throw new TransportError('not-ready', 'Data channel is not open');
    }

    const request = await this.#buildRequest(input, init);
    const id = this.#nextRequestId++;
    const baseFrame = await requestToFrames(id, request);
    // Cookie is a forbidden request header in browsers — `new Request(url, { headers })`
    // silently drops any `Cookie` we try to set, even when the request is bound for
    // our data-channel transport. We bypass that by inlining the Cookie pair
    // into the wire frame *after* serialization, so the hub still sees it.
    const frame = this.#withCookieHeader(baseFrame, request);
    debug('→ request', { id, method: frame.method, url: frame.url });

    const assembler = new ResponseAssembler();
    const responsePromise = new Promise<Response>((resolve, reject) => {
      const inflight: Inflight = {
        assembler,
        resolve,
        reject,
        headSeen: false,
      };
      this.#inflight.set(id, inflight);

      // Plumb the assembler's head/error into the outer promise.
      void assembler.response().then(
        (res) => {
          inflight.headSeen = true;
          resolve(res);
        },
        (err: unknown) => {
          inflight.headSeen = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      );
    });

    // Hook AbortSignal so the caller can cancel an in-flight request.
    const signal = init?.signal;
    if (signal) {
      if (signal.aborted) {
        this.#abort(id);
        throw new DOMException('Aborted', 'AbortError');
      }
      signal.addEventListener(
        'abort',
        () => {
          this.#abort(id);
        },
        { once: true }
      );
    }

    this.#channel.send(encodeRpc(frame));
    return responsePromise;
  }

  // ─── Connection lifecycle ──────────────────────────────────────────────

  #ensureConnected(): Promise<void> {
    if (this.#state === 'connected') {
      return Promise.resolve();
    }
    if (!this.#connectPromise) {
      this.#connectPromise = this.#connect();
    }
    return this.#connectPromise;
  }

  async #connect(): Promise<void> {
    this.#setState(this.#reconnectAttempt === 0 ? 'connecting' : 'reconnecting');
    try {
      const { ticket, iceServers } = await this.#fetchTicket();
      const wsUrl = this.#buildWsUrl(ticket);
      await this.#openSession(wsUrl, iceServers);
      this.#reconnectAttempt = 0;
      this.#setState('connected');
    } catch (err) {
      this.#connectPromise = null;
      this.#scheduleReconnect();
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async #fetchTicket(): Promise<{ ticket: string; iceServers: ReadonlyArray<IceServer> }> {
    const res = await globalThis.fetch(`${this.#options.coordinatorOrigin}/v1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hubName: this.#options.hubName }),
    });
    if (!res.ok) {
      throw new TransportError('ticket-failed', `Ticket fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as {
      ticket: string;
      iceServers?: ReadonlyArray<IceServer>;
    };
    // Older coordinators may not include `iceServers` — fall back to a
    // sane default so the peer connection still gets candidates.
    return { ticket: body.ticket, iceServers: body.iceServers ?? DEFAULT_ICE_SERVERS };
  }

  #buildWsUrl(ticket: string): string {
    const u = new URL('/v1/client', this.#options.coordinatorOrigin);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('hub', this.#options.hubName);
    u.searchParams.set('ticket', ticket);
    return u.toString();
  }

  #openSession(wsUrl: string, iceServers: ReadonlyArray<IceServer>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TransportError('connect-timeout', 'Connection timed out'));
        this.#teardown('connect-timeout', 'Connection timed out');
      }, CONNECT_TIMEOUT_MS);

      const ws = new WebSocket(wsUrl, [`brika.v${PROTOCOL_VERSION}`]);
      this.#ws = ws;

      ws.addEventListener('open', () => {
        this.#bootstrapPeer(iceServers, resolve, reject, () => clearTimeout(timer));
      });
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') {
          this.#onSignalingMessage(ev.data);
        }
      });
      ws.addEventListener('close', () => {
        clearTimeout(timer);
        this.#onUnexpectedClose('ws-closed', 'Signaling socket closed');
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new TransportError('ws-error', 'Signaling socket error'));
      });
    });
  }

  #bootstrapPeer(
    iceServers: ReadonlyArray<IceServer>,
    resolve: () => void,
    reject: (err: Error) => void,
    clearTimer: () => void
  ): void {
    // Filter out malformed entries — `urls: undefined` would crash with
    // "not iterable" the moment a downstream consumer spreads it.
    const rtcIceServers: RTCIceServer[] = [];
    for (const s of iceServers) {
      let urls: string | string[];
      if (typeof s.urls === 'string') {
        if (s.urls.length === 0) {
          continue;
        }
        urls = s.urls;
      } else if (Array.isArray(s.urls) && s.urls.length > 0) {
        urls = [...s.urls];
      } else {
        continue;
      }
      rtcIceServers.push({
        urls,
        ...(s.username && { username: s.username }),
        ...(s.credential && { credential: s.credential }),
      });
    }
    const pc = new RTCPeerConnection({ iceServers: rtcIceServers });
    this.#pc = pc;

    const channel = pc.createDataChannel('brika.rpc', { ordered: true });
    this.#channel = channel;

    channel.addEventListener('open', () => {
      clearTimer();
      resolve();
    });
    channel.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        this.#onRpcMessage(ev.data);
      }
    });
    channel.addEventListener('close', () => {
      this.#onUnexpectedClose('channel-closed', 'Data channel closed');
    });

    pc.addEventListener('icecandidate', (ev) => {
      if (!ev.candidate) {
        return;
      }
      const init: RTCIceCandidateInit = {
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
        usernameFragment: ev.candidate.usernameFragment,
      };
      // ICE gathering starts as soon as `setLocalDescription(offer)` resolves
      // — well before the coordinator round-trip returns `session.answer`.
      // Queue candidates until `#sessionId` lands; they're flushed in
      // `#onSignalingMessage` on the `session.answer` branch.
      if (!this.#ws || !this.#sessionId) {
        this.#pendingLocalIce.push(init);
        return;
      }
      this.#sendClientIce(init);
    });

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') {
        reject(new TransportError('peer-failed', 'Peer connection failed'));
        this.#onUnexpectedClose('peer-failed', 'Peer connection failed');
      }
    });

    // Create the offer and send it through signaling. The session id is
    // assigned by the coordinator on its first response; we keep it null
    // until then and only emit ICE candidates once it's known.
    void pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        const local = pc.localDescription;
        if (!local || !this.#ws) {
          return;
        }
        const msg: SignalingMessage = {
          v: PROTOCOL_VERSION,
          kind: 'client.offer',
          hubName: this.#options.hubName,
          sdp: local.sdp,
          ticket: '', // ticket already consumed in WS query string
        };
        this.#ws.send(encodeSignaling(msg));
      })
      .catch((err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  }

  #onSignalingMessage(raw: string): void {
    const msg = decodeSignaling(raw);
    if (!msg) {
      return;
    }
    switch (msg.kind) {
      case 'session.answer': {
        this.#sessionId = msg.sessionId;
        // Flush local candidates queued before `#sessionId` was assigned.
        const localToFlush = this.#pendingLocalIce;
        this.#pendingLocalIce = [];
        for (const cand of localToFlush) {
          this.#sendClientIce(cand);
        }
        void this.#applyAnswer(msg.sdp);
        return;
      }
      case 'session.ice':
        if (msg.from === 'hub') {
          this.#handleRemoteIce({
            candidate: msg.candidate.candidate,
            sdpMid: msg.candidate.sdpMid ?? undefined,
            sdpMLineIndex: msg.candidate.sdpMLineIndex ?? undefined,
          });
        }
        return;
      case 'session.error':
        this.#onUnexpectedClose(msg.code, msg.message);
        return;
      default:
        return;
    }
  }

  /**
   * Apply the hub's answer SDP and flush any ICE candidates that arrived
   * before the remote description was ready.
   */
  async #applyAnswer(sdp: string): Promise<void> {
    if (!this.#pc) {
      return;
    }
    try {
      await this.#pc.setRemoteDescription({ type: 'answer', sdp });
    } catch {
      // The peer connection may have been closed mid-flight — drop silently.
      return;
    }
    this.#remoteDescriptionApplied = true;
    const queued = this.#pendingRemoteIce;
    this.#pendingRemoteIce = [];
    for (const candidate of queued) {
      try {
        await this.#pc.addIceCandidate(candidate);
      } catch {
        // Stale candidate; ignore.
      }
    }
  }

  /**
   * Send a single locally-gathered ICE candidate to the coordinator as a
   * `client.ice` frame. Caller must have a non-null `#ws` and `#sessionId`.
   */
  #sendClientIce(init: RTCIceCandidateInit): void {
    if (!this.#ws || !this.#sessionId) {
      return;
    }
    const msg: SignalingMessage = {
      v: PROTOCOL_VERSION,
      kind: 'client.ice',
      sessionId: this.#sessionId,
      candidate: {
        candidate: init.candidate ?? '',
        sdpMid: init.sdpMid ?? undefined,
        sdpMLineIndex: init.sdpMLineIndex ?? undefined,
        usernameFragment: init.usernameFragment ?? undefined,
      },
    };
    try {
      this.#ws.send(encodeSignaling(msg));
    } catch {
      /* socket may be closing — handled by close handler */
    }
  }

  /**
   * Queue ICE candidates that arrive before the answer has been applied;
   * `addIceCandidate` throws InvalidStateError if called with a null remote
   * description. Once the answer lands, {@link applyAnswer} flushes the queue.
   */
  #handleRemoteIce(candidate: RTCIceCandidateInit): void {
    if (!this.#pc) {
      return;
    }
    if (!this.#remoteDescriptionApplied) {
      this.#pendingRemoteIce.push(candidate);
      return;
    }
    void this.#pc.addIceCandidate(candidate).catch(() => {
      // Drop stale candidates silently.
    });
  }

  #onRpcMessage(raw: string): void {
    const msg = decodeRpc(raw);
    if (!msg) {
      debug('← drop malformed/wrong-version frame', { raw: raw.slice(0, 200) });
      return;
    }
    switch (msg.kind) {
      case 'hello':
        debug('← hello', { role: msg.role, version: msg.softwareVersion });
        return;
      case 'response.head': {
        const setCookies = msg.headers
          .filter(([n]) => n.toLowerCase() === 'set-cookie')
          .map(([, v]) => v);
        debug('← response.head', {
          id: msg.id,
          status: msg.status,
          headerNames: msg.headers.map(([n]) => n),
          setCookies,
        });
        this.#extractSetCookies(msg);
        const inflight = this.#inflight.get(msg.id);
        if (!inflight) {
          debug('← response.head for unknown id', { id: msg.id });
        }
        inflight?.assembler.onHead(msg);
        return;
      }
      case 'response.chunk': {
        const inflight = this.#inflight.get(msg.id);
        inflight?.assembler.onChunk(msg);
        return;
      }
      case 'response.end': {
        debug('← response.end', { id: msg.id });
        const inflight = this.#inflight.get(msg.id);
        inflight?.assembler.onEnd(msg);
        this.#inflight.delete(msg.id);
        return;
      }
      case 'response.error': {
        debug('← response.error', { id: msg.id, code: msg.code, message: msg.message });
        const inflight = this.#inflight.get(msg.id);
        inflight?.assembler.onError(msg);
        this.#inflight.delete(msg.id);
        return;
      }
      default:
        debug('← unhandled kind', { kind: msg.kind });
        return;
    }
  }

  #abort(id: number): void {
    const inflight = this.#inflight.get(id);
    if (!inflight) {
      return;
    }
    if (this.#channel?.readyState === 'open') {
      const abortFrame: AbortMessage = { v: PROTOCOL_VERSION, kind: 'abort', id };
      try {
        this.#channel.send(encodeRpc(abortFrame));
      } catch {
        /* ignore */
      }
    }
    inflight.assembler.onError({
      v: PROTOCOL_VERSION,
      kind: 'response.error',
      id,
      code: 'aborted',
      message: 'Aborted by client',
    });
    this.#inflight.delete(id);
  }

  // ─── URL / request helpers ─────────────────────────────────────────────

  #buildRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Request> {
    // Resolve relative URLs against the hub origin so the request constructor
    // accepts them and downstream middleware sees the canonical Host.
    if (typeof input === 'string') {
      return Promise.resolve(new Request(new URL(input, this.#options.hubOrigin), init));
    }
    if (input instanceof URL) {
      return Promise.resolve(new Request(input, init));
    }
    return Promise.resolve(new Request(input, init));
  }

  /**
   * Return a frame with the matching `Cookie` header inlined. We can't go
   * through `new Request(url, { headers })` because the browser's Request
   * constructor enforces Fetch's forbidden-header list and silently drops
   * Cookie. The wire frame is plain JSON pairs, so it survives.
   */
  #withCookieHeader(frame: RequestMessage, request: Request): RequestMessage {
    const path = new URL(request.url).pathname;
    const header = this.#cookies.cookieHeader(path);
    debug('cookie jar lookup', { path, attached: header || '(none)' });
    if (!header) {
      return frame;
    }
    const headers: Array<[string, string]> = frame.headers.map(([n, v]) => [n, v]);
    const existingIndex = headers.findIndex(([n]) => n.toLowerCase() === 'cookie');
    if (existingIndex >= 0) {
      headers[existingIndex] = ['Cookie', `${headers[existingIndex][1]}; ${header}`];
    } else {
      headers.push(['Cookie', header]);
    }
    return { ...frame, headers };
  }

  /**
   * Pull `Set-Cookie` values out of a response head and feed them into the
   * jar. The wire shape preserves repeated header names as separate pairs,
   * so multiple cookies in one response are handled correctly.
   */
  #extractSetCookies(head: ResponseHeadMessage): void {
    for (const [name, value] of head.headers) {
      if (name.toLowerCase() === 'set-cookie') {
        this.#cookies.store(value);
      }
    }
  }

  // ─── Failure / teardown / reconnect ────────────────────────────────────

  #onUnexpectedClose(code: string, message: string): void {
    this.#teardown(code, message);
    if (!this.#closed) {
      this.#scheduleReconnect();
    }
  }

  #teardown(code: string, message: string): void {
    for (const inflight of this.#inflight.values()) {
      inflight.assembler.onError({
        v: PROTOCOL_VERSION,
        kind: 'response.error',
        id: -1,
        code,
        message,
      });
    }
    this.#inflight.clear();
    this.#channel?.close();
    this.#channel = null;
    this.#pc?.close();
    this.#pc = null;
    this.#ws?.close();
    this.#ws = null;
    this.#sessionId = null;
    this.#pendingRemoteIce = [];
    this.#pendingLocalIce = [];
    this.#remoteDescriptionApplied = false;
    this.#connectPromise = null;
  }

  #scheduleReconnect(): void {
    if (this.#closed) {
      return;
    }
    this.#reconnectAttempt += 1;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** (this.#reconnectAttempt - 1));
    setTimeout(() => {
      if (this.#closed) {
        return;
      }
      this.#connectPromise = this.#connect();
    }, delay);
  }

  #setState(state: DataChannelTransportState): void {
    if (state === this.#state) {
      return;
    }
    this.#state = state;
    this.#options.onStateChange?.(state);
  }
}
