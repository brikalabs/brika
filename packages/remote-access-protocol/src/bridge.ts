/**
 * HTTP ↔ RPC frame bridge.
 *
 * Symmetric streaming in both directions:
 *
 * Client → hub (request side):
 * - {@link emitRequest} — encode a browser `Request` as `request` head +
 *   N × `request.chunk` + `request.end`. The body streams over the channel
 *   in 16 KiB slices so uploads larger than SCTP's per-message cap (~64 KiB
 *   in Chrome) survive.
 * - {@link RequestAssembler} — hub-side state machine that turns the stream
 *   of `request.chunk` frames back into a `ReadableStream<Uint8Array>` that
 *   `app.fetch()` can consume directly.
 * - {@link rpcRequestToFetch} — wraps `RequestAssembler.body()` into a real
 *   `Request` instance for `app.fetch()`.
 *
 * Hub → client (response side):
 * - {@link responseToFrames} — stream a `Response` as `response.head` +
 *   `response.chunk*` + `response.end` / `response.error`.
 * - {@link ResponseAssembler} — client-side state machine that rebuilds a
 *   streaming `Response` from the incoming chunks.
 *
 * All helpers preserve repeated headers via the `[name, value][]` shape used
 * by the wire types.
 */

import type {
  RequestChunkMessage,
  RequestEndMessage,
  RequestMessage,
  ResponseChunkMessage,
  ResponseEndMessage,
  ResponseErrorMessage,
  ResponseHeadMessage,
  RpcMessage,
} from './rpc';
import { PROTOCOL_VERSION } from './version';

/**
 * Headers that MUST never traverse the data channel. These are either hop-by-
 * hop (defined by RFC 7230) or would actively break the bridged transport.
 * Stripped on both ingress and egress.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Browsers manage these; passing them through breaks the FE's fetch.
  'host',
  'content-length',
  // Forwarding headers — the hub-side bridge stamps a trusted `x-real-ip`
  // on its synthesized Request; any client-side `x-forwarded-for` /
  // `forwarded` / `x-real-ip` arriving in the frame would otherwise be
  // preferred by downstream middleware (auth, rate-limit) and let a peer
  // spoof the remote IP. Strip them at the protocol boundary so no consumer
  // has to remember to.
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'forwarded',
]);

function headersToPairs(headers: Headers): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) {
      return;
    }
    // `Headers.forEach` callers see `set-cookie` as a single comma-joined
    // string per the Fetch spec — that mangles real cookies whose Expires
    // date contains commas. We handle Set-Cookie separately via
    // `getSetCookie()` below, so skip it here.
    if (lower === 'set-cookie') {
      return;
    }
    pairs.push([name, value]);
  });
  // `getSetCookie()` (web standard since 2023, supported by Bun + modern
  // browsers + Node) returns each Set-Cookie value as its own array entry
  // — preserving multiple cookies and any commas in Expires.
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    for (const cookie of getSetCookie.call(headers)) {
      pairs.push(['set-cookie', cookie]);
    }
  }
  return pairs;
}

function pairsToHeaders(pairs: ReadonlyArray<readonly [string, string]>): Headers {
  const headers = new Headers();
  for (const [name, value] of pairs) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    headers.append(name, value);
  }
  return headers;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCodePoint(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return bytes;
}

// Shared across all chunk assemblers — `TextEncoder` is stateless, so a
// single instance is safe to reuse and saves an allocation per inbound chunk.
const TEXT_ENCODER = new TextEncoder();

/**
 * Stable error code emitted when a peer streams more body bytes than the
 * assembler's `maxBodyBytes`. Surfaced on the stream's error so callers
 * (the hub dispatcher, the FE transport) can map it to a 413 / typed error.
 */
export const BODY_TOO_LARGE_CODE = 'body-too-large';

export class BodyTooLargeError extends Error {
  readonly code = BODY_TOO_LARGE_CODE;
  readonly limit: number;
  constructor(limit: number) {
    super(`Body exceeded ${limit} bytes`);
    this.name = 'BodyTooLargeError';
    this.limit = limit;
  }
}

/**
 * Body-stream sink shared by {@link ResponseAssembler} (response.chunk/end)
 * and {@link RequestAssembler} (request.chunk/end). Exposes a
 * `ReadableStream<Uint8Array>` that consumers (the FE's `Response`, the hub's
 * `Request`) can read incrementally as frames arrive.
 *
 * If `maxBodyBytes` is set, the sink errors the stream with a
 * {@link BodyTooLargeError} once the running byte total would exceed it. This
 * is the hub's primary defence against a peer streaming unbounded chunks to
 * exhaust memory — without it, the sink buffers every byte the peer sends
 * until the consumer reads.
 */
class ChunkBodySink {
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  readonly stream: ReadableStream<Uint8Array>;
  #closed = false;
  #received = 0;
  readonly #maxBodyBytes: number | null;

  constructor(options: { maxBodyBytes?: number } = {}) {
    this.#maxBodyBytes = options.maxBodyBytes ?? null;
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#controller = controller;
      },
    });
  }

  enqueue(chunk: { dataText?: string; dataB64?: string; dataBin?: Uint8Array }): void {
    if (!this.#controller || this.#closed) {
      return;
    }
    let bytes: Uint8Array | null = null;
    if (chunk.dataBin !== undefined) {
      bytes = chunk.dataBin;
    } else if (chunk.dataText !== undefined) {
      bytes = TEXT_ENCODER.encode(chunk.dataText);
    } else if (chunk.dataB64 !== undefined) {
      bytes = base64ToBytes(chunk.dataB64);
    }
    if (!bytes) {
      return;
    }
    if (this.#maxBodyBytes !== null && this.#received + bytes.byteLength > this.#maxBodyBytes) {
      this.error(new BodyTooLargeError(this.#maxBodyBytes));
      return;
    }
    this.#received += bytes.byteLength;
    this.#controller.enqueue(bytes);
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#controller?.close();
  }

  error(err: Error): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#controller?.error(err);
  }
}

/** True for content-types whose body is safely UTF-8 text. */
function isTextContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  const lower = contentType.toLowerCase();
  return (
    lower.startsWith('text/') ||
    lower.includes('application/json') ||
    lower.includes('application/javascript') ||
    lower.includes('application/xml') ||
    lower.includes('+json') ||
    lower.includes('+xml') ||
    lower.includes('charset=')
  );
}

// ─── Chunked body streaming (used by both directions) ──────────────────────

/**
 * Max payload bytes per chunk frame before we fragment.
 *
 * WebRTC SCTP data channels cap a single `send()` at the negotiated
 * `maxMessageSize` — commonly 64 KiB in Chrome, but the JSON envelope + UTF-8
 * + JSON-escape blow-up for control chars can multiply the payload size 2–6x
 * on the wire. 16 KiB raw keeps every frame comfortably under any realistic
 * limit even after worst-case escaping.
 */
const MAX_CHUNK_PAYLOAD_BYTES = 16 * 1024;

/**
 * Read a body stream and emit chunk frames built by `buildChunk`. Returns
 * `true` if the stream completed normally, `false` if aborted mid-stream.
 * Used by both `emitRequest` and `responseToFrames` for symmetric chunking.
 *
 * `stream: true` on the decoder keeps incomplete UTF-8 sequences buffered
 * across calls — splitting on byte boundaries never corrupts multi-byte
 * characters. The tail flush at EOF drains the remaining bytes.
 */
async function streamBodyAsChunks<T extends RpcMessage>(
  body: ReadableStream<Uint8Array>,
  decoder: TextDecoder | null,
  buildChunk: (data: { dataText?: string; dataB64?: string }) => T,
  emit: (frame: T) => void | Promise<void>,
  abortSignal: AbortSignal | undefined
): Promise<boolean> {
  const reader = body.getReader();
  try {
    while (true) {
      if (abortSignal?.aborted) {
        return false;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      for (let offset = 0; offset < value.byteLength; offset += MAX_CHUNK_PAYLOAD_BYTES) {
        const slice = value.subarray(
          offset,
          Math.min(offset + MAX_CHUNK_PAYLOAD_BYTES, value.byteLength)
        );
        if (decoder) {
          await emit(buildChunk({ dataText: decoder.decode(slice, { stream: true }) }));
        } else {
          await emit(buildChunk({ dataB64: bytesToBase64(slice) }));
        }
      }
    }
    if (decoder) {
      const tail = decoder.decode();
      if (tail) {
        await emit(buildChunk({ dataText: tail }));
      }
    }
    return true;
  } finally {
    reader.releaseLock();
  }
}

// ─── Client side: encode a Request as request + chunks + end ───────────────

/**
 * Emit a browser `Request` over the channel as a `request` head frame plus
 * (for bodied requests) a stream of `request.chunk` frames terminated by
 * `request.end`. The caller provides `emit` to push each frame onto the
 * data channel.
 *
 * GET/HEAD never carry a body — emit a single head frame.
 *
 * For POST/PUT/PATCH/DELETE with a body, the head frame carries
 * `hasBody: true` so the hub-side dispatcher knows to wait for the chunks.
 * Bodyless POST/PUT (e.g., `fetch(url, { method: 'POST' })` with no body)
 * emits just the head — no chunks, no end frame needed.
 *
 * If `abortSignal` fires mid-upload, chunk emission stops; the caller is
 * responsible for following up with an `abort` frame so the hub clears its
 * pending assembler.
 */
export async function emitRequest(
  id: number,
  request: Request,
  emit: EmitFrame,
  options: { abortSignal?: AbortSignal } = {}
): Promise<void> {
  const headerPairs = headersToPairs(request.headers);
  const method = request.method.toUpperCase();
  const parsed = new URL(request.url);
  const pathQuery = parsed.pathname + parsed.search;

  const head: RequestMessage = {
    v: PROTOCOL_VERSION,
    kind: 'request',
    id,
    method,
    url: pathQuery,
    headers: headerPairs,
  };

  if (method === 'GET' || method === 'HEAD' || !request.body) {
    await emit(head);
    return;
  }

  await emit({ ...head, hasBody: true });

  const decoder = isTextContentType(request.headers.get('content-type')) ? new TextDecoder() : null;
  const completed = await streamBodyAsChunks<RequestChunkMessage>(
    request.body,
    decoder,
    (data) => ({ v: PROTOCOL_VERSION, kind: 'request.chunk', id, ...data }),
    emit,
    options.abortSignal
  );
  if (completed) {
    await emit({ v: PROTOCOL_VERSION, kind: 'request.end', id });
  }
  // Aborted: caller must follow up with an `abort` frame; emitting an end
  // here would let the hub dispatch with a truncated body.
}

// ─── Hub side: incoming RequestMessage → Request for app.fetch() ───────────

/**
 * Turn a `RequestMessage` head + an optional body stream into a standard
 * `Request` to feed into `app.fetch()`. The hub must supply `baseOrigin`
 * (e.g. `https://hub.brika.dev`) so the produced request has an absolute URL
 * and downstream middleware can inspect the canonical origin.
 *
 * If `msg.hasBody` is true, pass the body stream produced by
 * {@link RequestAssembler.body}; otherwise pass `null`.
 */
export function rpcRequestToFetch(
  msg: RequestMessage,
  baseOrigin: string,
  body: ReadableStream<Uint8Array> | null
): Request {
  // Refuse absolute URLs and protocol-relative URLs — they would discard
  // baseOrigin and let a malicious peer set an attacker-controlled host on
  // the synthesized Request, bypassing any host-allowlist middleware.
  if (!msg.url.startsWith('/') || msg.url.startsWith('//')) {
    throw new Error(`rpc: refusing non-absolute path "${msg.url}"`);
  }
  const url = new URL(msg.url, baseOrigin);
  const headers = pairsToHeaders(msg.headers);
  // The Host header was stripped on the FE side (hop-by-hop) and the wire
  // shape never carries it. Set it explicitly from `baseOrigin` so any
  // host-allowlist middleware on the hub sees the canonical hub host.
  headers.set('host', url.host);

  // `duplex: 'half'` is required when constructing a Request with a stream
  // body — without it Bun and modern fetch implementations throw. Cast via
  // `RequestInit & { duplex }` since lib.dom hasn't caught up with the spec.
  type ExtendedInit = RequestInit & { duplex?: 'half' };
  const init: ExtendedInit = {
    method: msg.method,
    headers,
    body,
  };
  if (body) {
    init.duplex = 'half';
  }

  return new Request(url.toString(), init);
}

// ─── Hub side: stream a Response back as RPC frames ────────────────────────

/**
 * Frame-emit callback. Accepts any RPC frame so the same helper works for
 * both request-side (client → hub) and response-side (hub → client) emission.
 * Callers wire it to `channel.send(encodeRpc(frame))`.
 */
export type EmitFrame = (frame: RpcMessage) => void | Promise<void>;

/**
 * Stream a `Response` over the data channel as a sequence of RPC frames.
 *
 * The caller (peer manager) provides `emit` to push each frame onto the
 * outbound channel. `responseToFrames` does not touch the channel directly,
 * keeping this module free of any WebRTC dependency.
 *
 * Body streaming reuses `streamBodyAsChunks`, the same helper used by
 * {@link emitRequest} — both directions use the same 16 KiB chunk cap.
 */
export async function responseToFrames(
  id: number,
  response: Response,
  emit: EmitFrame,
  options: { abortSignal?: AbortSignal } = {}
): Promise<void> {
  await emit({
    v: PROTOCOL_VERSION,
    kind: 'response.head',
    id,
    status: response.status,
    headers: headersToPairs(response.headers),
  });

  if (!response.body) {
    await emit({ v: PROTOCOL_VERSION, kind: 'response.end', id });
    return;
  }

  const decoder = isTextContentType(response.headers.get('content-type'))
    ? new TextDecoder()
    : null;

  try {
    const completed = await streamBodyAsChunks<ResponseChunkMessage>(
      response.body,
      decoder,
      (data) => ({ v: PROTOCOL_VERSION, kind: 'response.chunk', id, ...data }),
      emit,
      options.abortSignal
    );
    if (completed) {
      await emit({ v: PROTOCOL_VERSION, kind: 'response.end', id });
    } else {
      await emit({
        v: PROTOCOL_VERSION,
        kind: 'response.error',
        id,
        code: 'aborted',
        message: 'Request aborted by client',
      });
    }
  } catch (err) {
    await emit({
      v: PROTOCOL_VERSION,
      kind: 'response.error',
      id,
      code: 'stream-error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Client side: assemble a Response from incoming frames ─────────────────

/**
 * State machine that the FE feeds incoming frames into. Calling code reads
 * the assembled `Response` via `.response()` (resolves once `head` arrives)
 * and surfaces stream errors via `.error()` (resolves once the stream ends).
 *
 * The stream is exposed as a `ReadableStream<Uint8Array>` on the `Response`
 * body, so the FE can pipe it directly to `fetch`-shaped consumers.
 */
export class ResponseAssembler {
  #headResolve: ((res: Response) => void) | null = null;
  #headReject: ((err: Error) => void) | null = null;
  readonly #headPromise: Promise<Response>;
  readonly #body: ChunkBodySink;

  /**
   * `maxBodyBytes`: defensive cap so a misbehaving / hostile hub can't make
   * the FE buffer unbounded response bytes. Default omits the cap (responses
   * are trusted in the normal hub/client relationship), but tests + paranoid
   * consumers can pin a limit.
   */
  constructor(options: { maxBodyBytes?: number } = {}) {
    this.#body = new ChunkBodySink({ maxBodyBytes: options.maxBodyBytes });
    this.#headPromise = new Promise<Response>((resolve, reject) => {
      this.#headResolve = resolve;
      this.#headReject = reject;
    });
  }

  /** Resolves once `response.head` has been received. */
  response(): Promise<Response> {
    return this.#headPromise;
  }

  onHead(msg: ResponseHeadMessage): void {
    if (!this.#headResolve) {
      return;
    }
    const response = new Response(this.#body.stream, {
      status: msg.status,
      headers: pairsToHeaders(msg.headers),
    });
    this.#headResolve(response);
    this.#headResolve = null;
    this.#headReject = null;
  }

  onChunk(msg: ResponseChunkMessage): void {
    this.#body.enqueue(msg);
  }

  onEnd(_msg: ResponseEndMessage): void {
    this.#body.close();
  }

  onError(msg: ResponseErrorMessage): void {
    const err = new Error(`${msg.code}: ${msg.message}`);
    if (this.#headReject) {
      this.#headReject(err);
      this.#headReject = null;
      this.#headResolve = null;
    }
    this.#body.error(err);
  }
}

// ─── Hub side: assemble a Request body from incoming chunk frames ──────────

/**
 * Hub-side state machine: `request.chunk` frames enqueue onto a body stream
 * that the dispatcher hands directly to `new Request(..., { body: stream })`,
 * so the hub's app reads chunks as they arrive — not after the full upload.
 */
export class RequestAssembler {
  readonly #sink: ChunkBodySink;

  /**
   * `maxBodyBytes`: hub-side cap on upload size. A peer streaming more bytes
   * than this trips a {@link BodyTooLargeError} on the body stream; the hub
   * dispatcher catches it and replies with a `body-too-large` response.error.
   * Required defence against unbounded-upload DoS — without it, a malicious
   * peer can sink-fill the hub by streaming chunks the app handler never
   * fully consumes.
   */
  constructor(options: { maxBodyBytes?: number } = {}) {
    this.#sink = new ChunkBodySink({ maxBodyBytes: options.maxBodyBytes });
  }

  /** Body stream — pass to `rpcRequestToFetch` as the body argument. */
  body(): ReadableStream<Uint8Array> {
    return this.#sink.stream;
  }

  onChunk(msg: RequestChunkMessage): void {
    this.#sink.enqueue(msg);
  }

  onEnd(_msg: RequestEndMessage): void {
    this.#sink.close();
  }

  abort(err: Error): void {
    this.#sink.error(err);
  }
}
