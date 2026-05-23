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
  type BinaryChunkKind,
  DEFAULT_ICE_SERVERS,
  decodeBinaryChunk,
  decodeRpc,
  decodeSignaling,
  emitRequest,
  encodeBinaryChunk,
  encodeRpc,
  encodeSignaling,
  type IceServer,
  PROTOCOL_VERSION,
  ResponseAssembler,
  type ResponseHeadMessage,
  RPC_CAPABILITIES,
  type RpcMessage,
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
 * Upload backpressure thresholds. Pause emitting chunk frames when SCTP's
 * `bufferedAmount` crosses HIGH; resume once it drains below LOW. Tuned for
 * a comfortable margin under the typical 16 MiB Chrome SCTP buffer while
 * keeping memory pressure bounded for multi-megabyte uploads.
 */
const BUFFER_HIGH_WATER_BYTES = 1 * 1024 * 1024;
const BUFFER_LOW_WATER_BYTES = 256 * 1024;

/**
 * Per-response body cap. Defends the FE tab against a misbehaving or
 * compromised hub streaming unbounded body bytes — without it, the
 * `ResponseAssembler`'s sink buffers every received byte until the caller
 * reads (or OOMs the tab). Matches the hub's upload cap for symmetry.
 */
const MAX_RESPONSE_BODY_BYTES = 50 * 1024 * 1024;

/**
 * Splice the cookie-jar header into a `request` head frame. Cookie is a
 * forbidden request header in browsers — `new Request(url, { headers })`
 * silently drops it — so we inject at the wire-frame layer where it
 * survives the round-trip.
 */
function injectCookieIntoHead<T extends RpcMessage & { kind: 'request' }>(
  frame: T,
  cookieHeader: string
): T {
  if (!cookieHeader) {
    return frame;
  }
  const headers: Array<[string, string]> = frame.headers.map(([n, v]) => [n, v]);
  const existingIndex = headers.findIndex(([n]) => n.toLowerCase() === 'cookie');
  if (existingIndex >= 0) {
    headers[existingIndex] = ['Cookie', `${headers[existingIndex][1]}; ${cookieHeader}`];
  } else {
    headers.push(['Cookie', cookieHeader]);
  }
  return { ...frame, headers };
}

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
  /**
   * Flipped to `true` when the hub's hello frame carries `binary-frames` in
   * its `caps`. From that point on, body chunks emitted by `emitRequest`
   * route through `#sendBinaryChunk` (raw bytes on the wire) instead of
   * base64-encoded JSON. One-way ratchet — never downgrades back to b64.
   */
  #peerSupportsBinary = false;

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
    const path = new URL(request.url).pathname;
    const cookieHeader = this.#cookies.cookieHeader(path);
    debug('cookie jar lookup', { path, attached: cookieHeader || '(none)' });
    debug('→ request', { id, method: request.method, url: request.url });

    const assembler = new ResponseAssembler({ maxBodyBytes: MAX_RESPONSE_BODY_BYTES });
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

    // Cookie injection at the wire-frame layer: `new Request(url, { headers })`
    // silently drops `Cookie` (forbidden request header), so we splice it onto
    // the `request` head frame instead — `emitRequest` always emits head first.
    const emit = async (frame: RpcMessage): Promise<void> => {
      const next = frame.kind === 'request' ? injectCookieIntoHead(frame, cookieHeader) : frame;
      await this.#awaitDrain();
      this.#sendFrame(next);
    };
    // Binary path is opt-in per peer: until the hub's hello arrives with
    // `binary-frames`, body chunks travel as base64-in-JSON via `emit`. The
    // helper is captured at request start, so a peer that upgrades mid-stream
    // takes effect on the *next* request — fine for our use case (uploads are
    // discrete) and avoids the FE having to reason about partial-binary streams.
    const sendBinary = this.#peerSupportsBinary
      ? async (bytes: Uint8Array): Promise<void> => {
          await this.#awaitDrain();
          this.#sendBinaryChunk('request.chunk', id, bytes);
        }
      : undefined;
    void emitRequest(id, request, emit, { sendBinary }).catch((err: unknown) => {
      debug('emit failed', { id, err: err instanceof Error ? err.message : String(err) });
    });

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
    // Set once at channel creation so the LOW/HIGH hysteresis in `#awaitDrain`
    // actually triggers — setting it inside the slow path would race with the
    // first `bufferedamountlow` event.
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER_BYTES;
    // Receive binary frames as ArrayBuffer (default in browsers is 'blob' on
    // some legacy paths; pin it so the message handler's `typeof === 'string'`
    // branch is exhaustive for the binary case).
    channel.binaryType = 'arraybuffer';

    channel.addEventListener('open', () => {
      clearTimer();
      // Announce our caps so the hub knows it can send binary response chunks.
      // Conservative — the hub still won't send binary until it sees this.
      this.#sendFrame({
        v: PROTOCOL_VERSION,
        kind: 'hello',
        role: 'client',
        softwareVersion: 'brika-ui',
        maxProtocolVersion: PROTOCOL_VERSION,
        caps: [RPC_CAPABILITIES.BINARY_FRAMES],
      });
      resolve();
    });
    channel.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        this.#onRpcMessage(ev.data);
      } else if (ev.data instanceof ArrayBuffer) {
        this.#onBinaryMessage(ev.data);
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

  #onBinaryMessage(buffer: ArrayBuffer): void {
    const chunk = decodeBinaryChunk(buffer);
    if (!chunk) {
      debug('← drop malformed binary frame', { bytes: buffer.byteLength });
      return;
    }
    // Only `response.chunk` is meaningful inbound on the FE. `request.chunk`
    // in this direction means the hub is misbehaving — drop silently.
    if (chunk.kind !== 'response.chunk') {
      return;
    }
    // Route through the same `onChunk` arm the JSON path uses by synthesizing
    // a chunk message with `dataBin` set — the sink's enqueue handles all
    // three data shapes uniformly.
    this.#inflight.get(chunk.id)?.assembler.onChunk({
      v: PROTOCOL_VERSION,
      kind: 'response.chunk',
      id: chunk.id,
      dataBin: chunk.payload,
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
        debug('← hello', { role: msg.role, version: msg.softwareVersion, caps: msg.caps });
        // One-way capability ratchet: once the hub has advertised binary,
        // every subsequent request emits body chunks as raw bytes. Never
        // downgrades, even if a reconnected peer drops the cap.
        if (msg.caps?.includes(RPC_CAPABILITIES.BINARY_FRAMES)) {
          this.#peerSupportsBinary = true;
        }
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
        this.#sendFrame(abortFrame);
      } catch {
        // #sendFrame already tore the transport down on a send failure;
        // the assembler.onError below still surfaces the abort to the caller.
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

  /**
   * Send a JSON-text RPC frame. Routes any `channel.send` failure
   * (`"Message too large"`, `InvalidStateError` mid-flight) through
   * `#onUnexpectedClose` so inflights get a real `TransportError` instead
   * of a silently-truncated channel.
   */
  #sendFrame(frame: RpcMessage): void {
    const channel = this.#assertChannelOpen();
    try {
      channel.send(encodeRpc(frame));
    } catch (err) {
      this.#routeSendError(err);
    }
  }

  /** Same failure routing as {@link #sendFrame}, for raw-binary chunks. */
  #sendBinaryChunk(kind: BinaryChunkKind, id: number, bytes: Uint8Array): void {
    const channel = this.#assertChannelOpen();
    try {
      channel.send(encodeBinaryChunk(kind, id, bytes));
    } catch (err) {
      this.#routeSendError(err);
    }
  }

  #assertChannelOpen(): RTCDataChannel {
    const channel = this.#channel;
    if (channel?.readyState !== 'open') {
      this.#onUnexpectedClose('channel-closed', 'Channel not open at send time');
      throw new TransportError('channel-closed', 'Channel not open at send time');
    }
    return channel;
  }

  #routeSendError(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err);
    this.#onUnexpectedClose('send-failed', message);
    throw err instanceof Error ? err : new Error(message);
  }

  /**
   * Backpressure for streaming uploads. Pauses chunk emission when SCTP's
   * `bufferedAmount` crosses HIGH and resumes once it drains below the
   * `bufferedAmountLowThreshold` set at channel creation. Also resolves on
   * channel close so a teardown mid-upload doesn't leak a never-resolving
   * promise (and its captured chunk).
   */
  async #awaitDrain(): Promise<void> {
    const channel = this.#channel;
    if (!channel || channel.bufferedAmount <= BUFFER_HIGH_WATER_BYTES) {
      return;
    }
    await new Promise<void>((resolve) => {
      const cleanup = (): void => {
        channel.removeEventListener('bufferedamountlow', cleanup);
        channel.removeEventListener('close', cleanup);
        channel.removeEventListener('error', cleanup);
        resolve();
      };
      channel.addEventListener('bufferedamountlow', cleanup);
      channel.addEventListener('close', cleanup);
      channel.addEventListener('error', cleanup);
    });
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
    // Reset so the reconnected session re-negotiates from scratch — a
    // reconnect may land on a peer that doesn't speak binary-frames.
    this.#peerSupportsBinary = false;
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
