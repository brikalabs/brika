/**
 * HTTP ↔ RPC frame bridge.
 *
 * Two functions:
 *
 * - {@link requestToFrames} — encode a `Request` (browser-side) into the
 *   {@link RequestMessage} that goes onto the data channel. Used by the FE.
 *
 * - {@link framesToResponse} — assemble a streaming `Response` from the
 *   sequence of `response.head` + `response.chunk*` + `response.end`/`error`
 *   frames received from the hub. Used by the FE.
 *
 * And on the hub side:
 *
 * - {@link rpcRequestToFetch} — turn an incoming `RequestMessage` into the
 *   `Request` instance passed to `app.fetch()`.
 *
 * - {@link responseToFrames} — stream a `Response` returned by `app.fetch()`
 *   back over the channel as `response.head` + chunks + `end`/`error`.
 *
 * All helpers preserve repeated headers via the `[name, value][]` shape used
 * by the wire types.
 */

import type {
  RequestMessage,
  ResponseChunkMessage,
  ResponseEndMessage,
  ResponseErrorMessage,
  ResponseHeadMessage,
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
]);

function headersToPairs(headers: Headers): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  headers.forEach((value, name) => {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      return;
    }
    pairs.push([name, value]);
  });
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

// ─── Client side: encode a Request → RequestMessage ────────────────────────

export async function requestToFrames(id: number, request: Request): Promise<RequestMessage> {
  const headerPairs = headersToPairs(request.headers);

  // GET/HEAD never carry bodies.
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return {
      v: PROTOCOL_VERSION,
      kind: 'request',
      id,
      method,
      url: new URL(request.url).pathname + new URL(request.url).search,
      headers: headerPairs,
    };
  }

  const buffer = await request.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const contentType = request.headers.get('content-type');

  const base: RequestMessage = {
    v: PROTOCOL_VERSION,
    kind: 'request',
    id,
    method,
    url: new URL(request.url).pathname + new URL(request.url).search,
    headers: headerPairs,
  };

  if (bytes.byteLength === 0) {
    return base;
  }

  if (isTextContentType(contentType)) {
    return { ...base, bodyText: new TextDecoder().decode(bytes) };
  }
  return { ...base, bodyB64: bytesToBase64(bytes) };
}

// ─── Hub side: incoming RequestMessage → Request for app.fetch() ───────────

/**
 * Turn an incoming `RequestMessage` into a standard `Request` to feed into
 * `app.fetch()`. The hub must supply `baseOrigin` (e.g. `https://maxime.brika.dev`)
 * so the produced request has an absolute URL and downstream middleware can
 * inspect the canonical origin.
 */
export function rpcRequestToFetch(msg: RequestMessage, baseOrigin: string): Request {
  const url = new URL(msg.url, baseOrigin);
  const headers = pairsToHeaders(msg.headers);
  // The Host header was stripped on the FE side (hop-by-hop) and the wire
  // shape never carries it. Set it explicitly from `baseOrigin` so any
  // host-allowlist middleware on the hub sees the canonical hub host
  // rather than `null`.
  headers.set('host', url.host);

  // `BodyInit` is part of lib.dom but our hub tsconfig is stricter; use
  // `string | ArrayBuffer | null` directly since those are the only shapes we produce.
  let body: string | ArrayBuffer | null = null;
  if (msg.bodyText !== undefined) {
    body = msg.bodyText;
  } else if (msg.bodyB64 !== undefined) {
    const bytes = base64ToBytes(msg.bodyB64);
    // Copy into a fresh ArrayBuffer — Bun's BodyInit accepts ArrayBuffer
    // (but not Uint8Array or SharedArrayBuffer) under strict typings.
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    body = ab;
  }

  return new Request(url.toString(), {
    method: msg.method,
    headers,
    body,
  });
}

// ─── Hub side: stream a Response back as RPC frames ────────────────────────

export type EmitFrame = (
  frame: ResponseHeadMessage | ResponseChunkMessage | ResponseEndMessage | ResponseErrorMessage
) => void | Promise<void>;

/**
 * Stream a `Response` over the data channel as a sequence of RPC frames.
 *
 * The caller (peer manager) provides `emit` to push each frame onto the
 * outbound channel. `responseToFrames` does not touch the channel directly,
 * keeping this module free of any WebRTC dependency.
 *
 * Streaming bodies are forwarded as multiple `response.chunk` frames; the
 * function awaits each `emit` so the peer manager can apply backpressure.
 */
function emitChunk(
  id: number,
  bytes: Uint8Array,
  decoder: TextDecoder | null,
  emit: EmitFrame
): void | Promise<void> {
  if (decoder) {
    return emit({
      v: PROTOCOL_VERSION,
      kind: 'response.chunk',
      id,
      dataText: decoder.decode(bytes, { stream: true }),
    });
  }
  return emit({
    v: PROTOCOL_VERSION,
    kind: 'response.chunk',
    id,
    dataB64: bytesToBase64(bytes),
  });
}

async function streamBodyToFrames(
  id: number,
  body: ReadableStream<Uint8Array>,
  decoder: TextDecoder | null,
  emit: EmitFrame,
  abortSignal: AbortSignal | undefined
): Promise<void> {
  const reader = body.getReader();
  try {
    while (true) {
      if (abortSignal?.aborted) {
        await emit({
          v: PROTOCOL_VERSION,
          kind: 'response.error',
          id,
          code: 'aborted',
          message: 'Request aborted by client',
        });
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value && value.byteLength > 0) {
        await emitChunk(id, value, decoder, emit);
      }
    }
    // Flush any pending bytes still buffered by the streaming decoder.
    if (decoder) {
      const tail = decoder.decode();
      if (tail) {
        await emit({
          v: PROTOCOL_VERSION,
          kind: 'response.chunk',
          id,
          dataText: tail,
        });
      }
    }
    await emit({ v: PROTOCOL_VERSION, kind: 'response.end', id });
  } finally {
    reader.releaseLock();
  }
}

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
    await streamBodyToFrames(id, response.body, decoder, emit, options.abortSignal);
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
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #closed = false;

  constructor() {
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
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#controller = controller;
      },
    });
    const response = new Response(stream, {
      status: msg.status,
      headers: pairsToHeaders(msg.headers),
    });
    this.#headResolve(response);
    this.#headResolve = null;
    this.#headReject = null;
  }

  onChunk(msg: ResponseChunkMessage): void {
    if (!this.#controller || this.#closed) {
      return;
    }
    if (msg.dataText !== undefined) {
      this.#controller.enqueue(new TextEncoder().encode(msg.dataText));
    } else if (msg.dataB64 !== undefined) {
      this.#controller.enqueue(base64ToBytes(msg.dataB64));
    }
  }

  onEnd(_msg: ResponseEndMessage): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#controller?.close();
  }

  onError(msg: ResponseErrorMessage): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    const err = new Error(`${msg.code}: ${msg.message}`);
    if (this.#headReject) {
      this.#headReject(err);
      this.#headReject = null;
      this.#headResolve = null;
    }
    this.#controller?.error(err);
  }
}
