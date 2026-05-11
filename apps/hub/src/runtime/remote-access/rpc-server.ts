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

import {
  type AbortMessage,
  PROTOCOL_VERSION,
  type RequestMessage,
  responseToFrames,
  rpcRequestToFetch,
  type RpcMessage,
} from '@brika/remote-access-protocol';
import type { ApiServer } from '@/runtime/http/api-server';
import type { SignalingLogger } from './signaling-client';

export interface RpcServerOptions {
  readonly sessionId: string;
  readonly baseOrigin: string;
  readonly apiServer: ApiServer;
  readonly remoteIp: string;
  readonly log: SignalingLogger;
}

interface InFlight {
  readonly controller: AbortController;
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
        const exhaustive: never = msg;
        void exhaustive;
        return;
      }
    }
  }

  /** Cancel everything (peer session is closing). */
  shutdown(): void {
    for (const { controller } of this.#inflight.values()) {
      controller.abort();
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
    this.#inflight.set(msg.id, { controller });

    // Run the request fully async; do not block the caller.
    void this.#runRequest(msg, send, controller.signal).finally(() => {
      this.#inflight.delete(msg.id);
    });
  }

  async #runRequest(
    msg: RequestMessage,
    send: (frame: RpcMessage) => void,
    signal: AbortSignal
  ): Promise<void> {
    let request: Request;
    try {
      request = rpcRequestToFetch(msg, this.#options.baseOrigin);
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
  }
}
