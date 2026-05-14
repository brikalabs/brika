/**
 * RPC protocol — over a single WebRTC data channel between a browser and a hub.
 *
 * Design goals:
 *
 * 1. **Faithful HTTP encoding** — every frame maps to standard `Request`/`Response`
 *    semantics so the existing hub HTTP API works unchanged: the hub bridges
 *    each {@link RequestMessage} to `app.fetch()` and streams the response back.
 *
 * 2. **Cross-version compatible** — a v0.4 FE must still talk to a v0.1 hub
 *    and vice-versa. New optional fields are additive; old peers ignore them.
 *
 * 3. **Streaming-first** — every response is sent as `head` + N × `chunk` + `end`
 *    (or `error`). Single-shot responses are just one chunk. This keeps SSE,
 *    log streams, and file downloads working over the channel.
 *
 * Wire format: JSON text frames over the data channel. Binary bodies are
 * base64-encoded inline (`bodyB64`). For large/streaming bodies, prefer
 * chunked frames over a single huge inline payload.
 */

import type { ProtocolVersion } from './version';

export interface RpcEnvelope {
  /** Protocol major version. */
  readonly v: ProtocolVersion;
}

// ─── Handshake ─────────────────────────────────────────────────────────────

/**
 * First frame on a freshly-opened data channel. Both peers exchange a hello
 * to agree on capabilities. The party that sends `hello` first does not block
 * on the reply — capabilities default to the conservative intersection.
 */
export interface HelloMessage extends RpcEnvelope {
  readonly kind: 'hello';
  readonly role: 'hub' | 'client';
  /** Software version (informational). */
  readonly softwareVersion: string;
  /** Highest protocol version this peer understands. */
  readonly maxProtocolVersion: number;
  /** Capability flags. Receivers MUST treat unknown caps as ignored. */
  readonly caps?: ReadonlyArray<string>;
}

// ─── Request side (client → hub) ───────────────────────────────────────────

/**
 * Encodes an HTTP request head — `request` carries metadata only; the body
 * (if any) streams over subsequent {@link RequestChunkMessage} frames and
 * terminates with {@link RequestEndMessage}.
 *
 * `id` is a monotonically increasing integer chosen by the client; the hub
 * echoes it on every response frame so the client can correlate. Ids are
 * scoped to a single data channel and may be reused after the request
 * completes.
 *
 * The request → chunks → end shape mirrors the response side
 * (`response.head` + `response.chunk*` + `response.end`/`error`) so the
 * channel can carry uploads larger than SCTP's per-message cap (~64 KiB in
 * Chrome). The previous inline `bodyText`/`bodyB64` shape silently truncated
 * once the JSON-escaped base64 envelope crossed that limit; chunking fixes it.
 */
export interface RequestMessage extends RpcEnvelope {
  readonly kind: 'request';
  readonly id: number;
  readonly method: string;
  /**
   * Absolute path + query string (e.g. `/api/health?foo=bar`). The hub
   * prepends the canonical public origin when bridging to `app.fetch()`.
   */
  readonly url: string;
  /**
   * Headers as a flat array of `[name, value]` pairs to preserve repeated
   * headers (e.g. multiple `Set-Cookie` values). Hop-by-hop headers MUST be
   * stripped by both sides.
   */
  readonly headers: ReadonlyArray<readonly [string, string]>;
  /**
   * `true` when one or more {@link RequestChunkMessage} frames follow before
   * {@link RequestEndMessage}. Absent/`false` means the request has no body
   * and the hub should dispatch immediately on receiving the head frame.
   */
  readonly hasBody?: boolean;
}

/**
 * A request body chunk. Sent zero-or-more times between `request` and
 * `request.end`. Exactly one of the three data fields is set per frame.
 *
 * `dataBin` is in-process only — it never travels over the wire as JSON
 * (the codec strips it). The binary transport decodes a raw chunk frame
 * into a synthesized `RequestChunkMessage` with `dataBin` set so the
 * same `RpcServer` switch arm handles both wire forms.
 */
export interface RequestChunkMessage extends RpcEnvelope {
  readonly kind: 'request.chunk';
  readonly id: number;
  readonly dataText?: string;
  readonly dataB64?: string;
  readonly dataBin?: Uint8Array;
}

/** Final frame for a request body. Triggers dispatch on the hub side. */
export interface RequestEndMessage extends RpcEnvelope {
  readonly kind: 'request.end';
  readonly id: number;
}

/**
 * Cancel an in-flight request. The hub MUST stop streaming chunks and emit a
 * final `response.error` with `code: 'aborted'`. Also valid mid-upload —
 * cancels the pending request assembler before dispatch.
 */
export interface AbortMessage extends RpcEnvelope {
  readonly kind: 'abort';
  readonly id: number;
}

// ─── Response side (hub → client) ──────────────────────────────────────────

/** First response frame: status + headers. Sent before any chunks. */
export interface ResponseHeadMessage extends RpcEnvelope {
  readonly kind: 'response.head';
  readonly id: number;
  readonly status: number;
  readonly headers: ReadonlyArray<readonly [string, string]>;
}

/**
 * A body chunk. Sent zero-or-more times between `head` and `end`/`error`.
 * Exactly one of the three data fields is set per frame. `dataBin` is
 * in-process only; see {@link RequestChunkMessage}.
 */
export interface ResponseChunkMessage extends RpcEnvelope {
  readonly kind: 'response.chunk';
  readonly id: number;
  readonly dataText?: string;
  readonly dataB64?: string;
  readonly dataBin?: Uint8Array;
}

/** Final frame for a successful response. */
export interface ResponseEndMessage extends RpcEnvelope {
  readonly kind: 'response.end';
  readonly id: number;
}

/**
 * Terminal error frame. The hub emits this in place of `response.end` (or in
 * the middle of a stream) when the request cannot complete. `code` is stable
 * and machine-readable; `message` is a human-readable description.
 */
export interface ResponseErrorMessage extends RpcEnvelope {
  readonly kind: 'response.error';
  readonly id: number;
  readonly code: string;
  readonly message: string;
  /** Optional HTTP status hint (if the error was generated mid-response). */
  readonly status?: number;
}

// ─── Aggregate ─────────────────────────────────────────────────────────────

export type RpcMessage =
  | HelloMessage
  | RequestMessage
  | RequestChunkMessage
  | RequestEndMessage
  | AbortMessage
  | ResponseHeadMessage
  | ResponseChunkMessage
  | ResponseEndMessage
  | ResponseErrorMessage;

export type RpcMessageKind = RpcMessage['kind'];

/**
 * Capability flags. Unknown flags MUST be ignored. Defined as a const-asserted
 * record so new flags can be added without breaking the type-checker.
 */
export const RPC_CAPABILITIES = {
  /** Peer supports chunked request bodies (`request.chunk` frames). v2. */
  CHUNKED_REQUESTS: 'chunked-requests',
  /** Peer supports binary frames (raw `ArrayBuffer`) for body bytes. v2. */
  BINARY_FRAMES: 'binary-frames',
  /** Peer supports request-side streaming (e.g. fetch with ReadableStream body). v2. */
  REQUEST_STREAMING: 'request-streaming',
} as const;

export type RpcCapability = (typeof RPC_CAPABILITIES)[keyof typeof RPC_CAPABILITIES];
