/**
 * RPC frame → `ApiServer.fetchInternal()` bridge.
 *
 * One {@link RpcServer} instance per {@link PeerSession}. It dispatches each
 * incoming {@link RequestMessage} to the in-process Hono app and streams the
 * resulting `Response` back as `response.head` + chunks + `end`/`error`.
 *
 * `id`s are scoped to a single data channel, so we keep an in-flight map keyed
 * by id. An incoming {@link AbortMessage} resolves the matching `AbortController`,
 * which `responseToFrames` observes to stop the stream early.
 *
 * The server never touches the WebRTC layer directly — it only consumes
 * decoded RPC frames and emits encoded ones via the supplied `send` callback.
 */

import { TRANSPORT_HEADER } from '@brika/auth';
import {
  type AbortMessage,
  BODY_TOO_LARGE_CODE,
  BodyTooLargeError,
  PROTOCOL_VERSION,
  RequestAssembler,
  type RequestMessage,
  type RpcMessage,
  responseToFrames,
  rpcRequestToFetch,
  type SendBinaryChunk,
} from '@brika/remote-access-protocol';
import type { ApiServer } from '@/runtime/http/api-server';
import type { RpcSender } from './peer-session';
import type { SignalingLogger } from './signaling-client';

export interface RpcServerOptions {
  readonly sessionId: string;
  readonly baseOrigin: string;
  readonly apiServer: ApiServer;
  readonly remoteIp: string;
  /**
   * `user-agent` to stamp on synthesized requests. Captured by the
   * coordinator at the WebSocket upgrade — harder to spoof than the
   * value the page bridge forwards over the data channel.
   */
  readonly remoteUserAgent?: string;
  /**
   * Per-request upload cap (bytes). A peer streaming more than this many
   * body bytes trips a {@link BodyTooLargeError} on the assembler's stream;
   * the dispatcher catches it and replies with `code: 'body-too-large'`.
   * Hub-side defence against unbounded-upload DoS — without it, a peer can
   * drive the hub OOM by streaming chunks the app handler never consumes.
   * Defaults to 50 MiB if omitted.
   */
  readonly maxRequestBodyBytes?: number;
  readonly log: SignalingLogger;
}

const DEFAULT_MAX_REQUEST_BODY_BYTES = 50 * 1024 * 1024;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Walk an error and its `cause` chain looking for our typed marker. The body
// stream's error gets re-thrown through fetch/Hono machinery and often arrives
// as a `TypeError` wrapping the original — we don't want a `body-too-large`
// outcome to surface as a generic `internal` 500.
function findBodyTooLarge(err: unknown): BodyTooLargeError | null {
  let cursor: unknown = err;
  for (let depth = 0; depth < 5 && cursor; depth++) {
    if (cursor instanceof BodyTooLargeError) {
      return cursor;
    }
    cursor = cursor instanceof Error ? cursor.cause : null;
  }
  return null;
}

interface InFlight {
  readonly controller: AbortController;
  /** Non-null while a body is streaming in; null for bodyless requests. */
  readonly assembler: RequestAssembler | null;
}

export class RpcServer {
  readonly #options: RpcServerOptions;
  readonly #inflight = new Map<number, InFlight>();

  constructor(options: RpcServerOptions) {
    this.#options = options;
  }

  /**
   * Dispatch a frame received from the peer. Binary body chunks arrive as a
   * synthesized `request.chunk` with `dataBin` set — the same switch arm
   * handles both wire forms transparently.
   */
  handle(msg: RpcMessage, sender: RpcSender): void {
    switch (msg.kind) {
      case 'hello':
        return;
      case 'request':
        this.#startRequest(msg, sender);
        return;
      case 'request.chunk':
        this.#inflight.get(msg.id)?.assembler?.onChunk(msg);
        return;
      case 'request.end':
        this.#inflight.get(msg.id)?.assembler?.onEnd(msg);
        return;
      case 'abort':
        this.#abort(msg);
        return;
      case 'response.head':
      case 'response.chunk':
      case 'response.end':
      case 'response.error':
        // These are hub-emitted frames; receiving them means the peer is
        // misbehaving. Drop silently.
        return;
      default: {
        // Exhaustive guard — TypeScript flags any unhandled `msg.kind`.
        msg satisfies never;
        return;
      }
    }
  }

  /** Cancel everything (peer session is closing). */
  shutdown(): void {
    for (const entry of this.#inflight.values()) {
      entry.controller.abort();
      entry.assembler?.abort(new Error('session-closed'));
    }
    this.#inflight.clear();
  }

  #startRequest(msg: RequestMessage, sender: RpcSender): void {
    if (this.#inflight.has(msg.id)) {
      // Duplicate id — surface an error frame so the client knows.
      sender.send({
        v: PROTOCOL_VERSION,
        kind: 'response.error',
        id: msg.id,
        code: 'duplicate-id',
        message: `Request id ${msg.id} already in flight`,
      });
      return;
    }

    const controller = new AbortController();
    const maxBodyBytes = this.#options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
    const assembler = msg.hasBody ? new RequestAssembler({ maxBodyBytes }) : null;
    this.#inflight.set(msg.id, { controller, assembler });

    // Dispatch eagerly — the assembler's stream backs the Request body so
    // `app.fetch()` reads chunks as `request.chunk` frames arrive.
    void this.#runRequest(msg, assembler, sender, controller.signal).finally(() => {
      this.#inflight.delete(msg.id);
    });
  }

  async #runRequest(
    msg: RequestMessage,
    assembler: RequestAssembler | null,
    sender: RpcSender,
    signal: AbortSignal
  ): Promise<void> {
    const request = this.#buildHubRequest(msg, assembler, sender);
    if (!request) {
      return;
    }
    const response = await this.#dispatch(request, msg, sender);
    if (!response) {
      return;
    }
    await this.#streamResponse(msg.id, response, sender, signal);
  }

  /**
   * Build the synthesized `Request` for `app.fetch()` and stamp the trusted
   * hub-side headers. Returns `null` after emitting a `bad-request` error
   * frame if the head can't be turned into a `Request` (e.g. non-absolute
   * URL — rejected by `rpcRequestToFetch`).
   */
  #buildHubRequest(
    msg: RequestMessage,
    assembler: RequestAssembler | null,
    sender: RpcSender
  ): Request | null {
    let request: Request;
    try {
      request = rpcRequestToFetch(msg, this.#options.baseOrigin, assembler?.body() ?? null);
    } catch (err) {
      this.#sendError(sender, msg.id, 'bad-request', errorMessage(err));
      return null;
    }
    request.headers.set('x-real-ip', this.#options.remoteIp);
    if (this.#options.remoteUserAgent) {
      request.headers.set('user-agent', this.#options.remoteUserAgent);
    }
    request.headers.set(TRANSPORT_HEADER, 'rtc');
    return request;
  }

  async #dispatch(
    request: Request,
    msg: RequestMessage,
    sender: RpcSender
  ): Promise<Response | null> {
    try {
      return await this.#options.apiServer.fetchInternal(request);
    } catch (err) {
      this.#handleDispatchError(err, msg, sender);
      return null;
    }
  }

  #handleDispatchError(err: unknown, msg: RequestMessage, sender: RpcSender): void {
    const tooLarge = findBodyTooLarge(err);
    if (tooLarge) {
      this.#options.log.warn('rpc upload exceeded limit', {
        sessionId: this.#options.sessionId,
        id: msg.id,
        url: msg.url,
        limit: tooLarge.limit,
      });
      // Keep the configured limit out of the peer-facing message — useful
      // intel for an attacker tuning their upload. Precise limit stays on
      // the hub log above.
      this.#sendError(sender, msg.id, BODY_TOO_LARGE_CODE, 'Request body too large', 413);
      return;
    }
    this.#options.log.error('rpc dispatch threw', {
      sessionId: this.#options.sessionId,
      id: msg.id,
      url: msg.url,
      error: errorMessage(err),
    });
    this.#sendError(sender, msg.id, 'internal', 'Internal server error');
  }

  async #streamResponse(
    id: number,
    response: Response,
    sender: RpcSender,
    signal: AbortSignal
  ): Promise<void> {
    // Wire the binary path only when the peer advertised `binary-frames`.
    // Live-read at request time: if the peer's hello hasn't arrived yet,
    // this request streams as base64-in-JSON and later requests upgrade
    // automatically.
    const sendBinary: SendBinaryChunk | undefined = sender.peerSupportsBinary()
      ? (bytes) => sender.sendBinaryChunk('response.chunk', id, bytes)
      : undefined;
    try {
      await responseToFrames(id, response, (f) => sender.send(f), {
        abortSignal: signal,
        sendBinary,
      });
    } catch (err) {
      this.#options.log.warn('rpc stream errored', {
        sessionId: this.#options.sessionId,
        id,
        error: errorMessage(err),
      });
    }
  }

  #sendError(sender: RpcSender, id: number, code: string, message: string, status?: number): void {
    sender.send({
      v: PROTOCOL_VERSION,
      kind: 'response.error',
      id,
      code,
      message,
      ...(status !== undefined && { status }),
    });
  }

  #abort(msg: AbortMessage): void {
    const entry = this.#inflight.get(msg.id);
    if (!entry) {
      return;
    }
    entry.controller.abort();
    // If the upload was still streaming in, surface the abort to the body
    // stream so `app.fetch()`'s reader sees an error instead of hanging on
    // a half-uploaded body.
    entry.assembler?.abort(new Error('aborted'));
  }
}
