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
  PROTOCOL_VERSION,
  RequestAssembler,
  type RequestChunkMessage,
  type RequestEndMessage,
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
  readonly log: SignalingLogger;
}

interface InFlight {
  readonly controller: AbortController;
  /**
   * Set while the request body is still streaming in. `onChunk` / `onEnd` /
   * client-side `abort` drive it. Once the body completes, the dispatcher
   * doesn't touch the assembler again — the running fetch reads chunks
   * directly off the stream the assembler exposes.
   */
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
        this.#onRequestChunk(msg);
        return;
      case 'request.end':
        this.#onRequestEnd(msg);
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
    const assembler = msg.hasBody ? new RequestAssembler() : null;
    this.#inflight.set(msg.id, { controller, assembler });

    // Dispatch immediately. For bodied requests the assembler exposes a
    // ReadableStream that `app.fetch()` consumes as `request.chunk` frames
    // arrive — `app.fetch()` doesn't have to wait for `request.end` before
    // starting. For bodyless requests we pass null.
    void this.#runRequest(msg, assembler, send, controller.signal).finally(() => {
      this.#inflight.delete(msg.id);
    });
  }

  #onRequestChunk(msg: RequestChunkMessage): void {
    const entry = this.#inflight.get(msg.id);
    if (!entry?.assembler) {
      // Chunk for an unknown / bodyless request — peer is confused. Drop.
      return;
    }
    entry.assembler.onChunk(msg);
  }

  #onRequestEnd(msg: RequestEndMessage): void {
    const entry = this.#inflight.get(msg.id);
    if (!entry?.assembler) {
      return;
    }
    entry.assembler.onEnd(msg);
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
