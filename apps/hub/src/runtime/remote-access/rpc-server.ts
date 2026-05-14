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
} from '@brika/remote-access-protocol';
import type { ApiServer } from '@/runtime/http/api-server';
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

  /** Dispatch a frame received from the peer. */
  handle(msg: RpcMessage, send: (frame: RpcMessage) => void): void {
    switch (msg.kind) {
      case 'hello':
        // Currently no capability negotiation needed beyond version match.
        return;
      case 'request':
        this.#startRequest(msg, send);
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

  #startRequest(msg: RequestMessage, send: (frame: RpcMessage) => void): void {
    if (this.#inflight.has(msg.id)) {
      // Duplicate id — surface an error frame so the client knows.
      send({
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
    void this.#runRequest(msg, assembler, send, controller.signal).finally(() => {
      this.#inflight.delete(msg.id);
    });
  }

  async #runRequest(
    msg: RequestMessage,
    assembler: RequestAssembler | null,
    send: (frame: RpcMessage) => void,
    signal: AbortSignal
  ): Promise<void> {
    let request: Request;
    try {
      request = rpcRequestToFetch(msg, this.#options.baseOrigin, assembler?.body() ?? null);
    } catch (err) {
      send({
        v: PROTOCOL_VERSION,
        kind: 'response.error',
        id: msg.id,
        code: 'bad-request',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Stamp the source so downstream middleware can apply rate limiting and
    // logging based on the remote peer rather than the loopback "socket".
    request.headers.set('x-real-ip', this.#options.remoteIp);
    if (this.#options.remoteUserAgent) {
      request.headers.set('user-agent', this.#options.remoteUserAgent);
    }
    request.headers.set(TRANSPORT_HEADER, 'rtc');

    let response: Response;
    try {
      response = await this.#options.apiServer.fetchInternal(request);
    } catch (err) {
      // Look through wrapping layers — Hono/fetch may re-wrap the stream error
      // as a `TypeError: The stream is errored` whose `cause` is the original
      // `BodyTooLargeError`.
      const tooLarge = findBodyTooLarge(err);
      if (tooLarge) {
        this.#options.log.warn('rpc upload exceeded limit', {
          sessionId: this.#options.sessionId,
          id: msg.id,
          url: msg.url,
          limit: tooLarge.limit,
        });
        send({
          v: PROTOCOL_VERSION,
          kind: 'response.error',
          id: msg.id,
          code: BODY_TOO_LARGE_CODE,
          message: tooLarge.message,
          status: 413,
        });
        return;
      }
      this.#options.log.error('rpc dispatch threw', {
        sessionId: this.#options.sessionId,
        id: msg.id,
        url: msg.url,
        error: err instanceof Error ? err.message : String(err),
      });
      send({
        v: PROTOCOL_VERSION,
        kind: 'response.error',
        id: msg.id,
        code: 'internal',
        message: 'Internal server error',
      });
      return;
    }

    try {
      await responseToFrames(msg.id, response, send, { abortSignal: signal });
    } catch (err) {
      this.#options.log.warn('rpc stream errored', {
        sessionId: this.#options.sessionId,
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
