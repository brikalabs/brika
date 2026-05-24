/**
 * Bounded response-body reader.
 *
 * `await res.text()` reads until EOF — a hostile (or buggy) server can
 * stream gigabytes and OOM the hub. We stream chunks and abort as soon as
 * the accumulated byte count crosses `maxResponseBytes`, throwing
 * `NET_BODY_TOO_LARGE`.
 *
 * Why chunk-by-chunk instead of trusting `Content-Length`: the header can
 * lie, can be absent on chunked transfer-encoding, and can be a lower bound
 * (compressed length vs. decompressed). Streaming is the only correct
 * implementation; the header is at best an optimization for short-circuit
 * rejection before we even start.
 */

import { errors } from '@brika/errors';

export interface ReadBoundedOptions {
  readonly limit: number;
}

/**
 * Read `response.body` as text, capped at `options.limit` bytes. Throws
 * `NET_BODY_TOO_LARGE` if exceeded. Releases the reader on every exit path
 * so a hostile peer can't keep the connection pinned by withholding EOF.
 */
export async function readBoundedText(
  response: Response,
  options: ReadBoundedOptions
): Promise<string> {
  // Short-circuit when the upstream pre-declares an oversize body. The
  // server may still send less, but advertising more is reason enough to
  // refuse — we don't want to pay even the streamed bytes.
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const advertised = Number(contentLength);
    if (Number.isFinite(advertised) && advertised > options.limit) {
      await response.body?.cancel().catch(() => undefined);
      throw errors.netBodyTooLarge({ limit: options.limit, received: advertised });
    }
  }

  if (!response.body) {
    // No body (e.g. HEAD or 204) — text() returns empty without streaming.
    return await response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > options.limit) {
        // Bail before holding the oversize chunk. Cancel propagates an
        // abort to the underlying connection so the server stops sending.
        await reader.cancel().catch(() => undefined);
        throw errors.netBodyTooLarge({ limit: options.limit, received });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return decode(chunks, received);
}

function decode(chunks: ReadonlyArray<Uint8Array>, totalBytes: number): string {
  if (chunks.length === 0) {
    return '';
  }
  if (chunks.length === 1) {
    return new TextDecoder().decode(chunks[0]);
  }
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
