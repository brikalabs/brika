/**
 * Encoding & decoding helpers for the wire protocols.
 *
 * Both protocols use JSON text frames. Decoding validates each frame against
 * a zod schema — enough to reject obviously malformed input from a peer that
 * speaks a different (or hostile) version, including missing required fields
 * — without locking us into a strict closed-world type.
 *
 * Each variant schema uses `.loose()` so unknown extra fields pass through
 * unchanged: any newer-version sender can include fields we don't know about
 * yet without their frame being rejected.
 *
 * All decoders return `null` on failure; callers MUST handle `null` as a
 * soft error (log + drop the frame) rather than throwing.
 */

import { z } from 'zod';
import type { RpcMessage } from './rpc';
import type { SignalingMessage } from './signaling';
import { PROTOCOL_VERSION } from './version';

const V = z.literal(PROTOCOL_VERSION);

// Shared sub-schemas.
const candidate = z
  .object({
    candidate: z.string(),
  })
  .loose();

// ─── Signaling kinds ────────────────────────────────────────────────────────

const signalingSchema = z.discriminatedUnion('kind', [
  z
    .object({ v: V, kind: z.literal('hub.register'), name: z.string(), hubVersion: z.string() })
    .loose(),
  z.object({ v: V, kind: z.literal('hub.answer'), sessionId: z.string(), sdp: z.string() }).loose(),
  z.object({ v: V, kind: z.literal('hub.ice'), sessionId: z.string(), candidate }).loose(),
  z.object({ v: V, kind: z.literal('hub.abort'), sessionId: z.string() }).loose(),
  z.object({ v: V, kind: z.literal('client.offer'), hubName: z.string(), sdp: z.string() }).loose(),
  z.object({ v: V, kind: z.literal('client.ice'), sessionId: z.string(), candidate }).loose(),
  z.object({ v: V, kind: z.literal('client.abort'), sessionId: z.string() }).loose(),
  z
    .object({ v: V, kind: z.literal('session.offer'), sessionId: z.string(), sdp: z.string() })
    .loose(),
  z
    .object({ v: V, kind: z.literal('session.answer'), sessionId: z.string(), sdp: z.string() })
    .loose(),
  z
    .object({
      v: V,
      kind: z.literal('session.ice'),
      sessionId: z.string(),
      candidate,
      from: z.union([z.literal('hub'), z.literal('client')]),
    })
    .loose(),
  z
    .object({ v: V, kind: z.literal('session.iceServers'), iceServers: z.array(z.unknown()) })
    .loose(),
  z.object({ v: V, kind: z.literal('session.error'), code: z.string() }).loose(),
]);

// ─── RPC kinds ──────────────────────────────────────────────────────────────

const rpcSchema = z.discriminatedUnion('kind', [
  z
    .object({
      v: V,
      kind: z.literal('hello'),
      role: z.union([z.literal('hub'), z.literal('client')]),
      softwareVersion: z.string(),
    })
    .loose(),
  z
    .object({
      v: V,
      kind: z.literal('request'),
      id: z.int(),
      method: z.string(),
      url: z.string(),
      headers: z.array(z.unknown()),
    })
    .loose(),
  z
    .object({
      v: V,
      kind: z.literal('request.chunk'),
      id: z.int(),
    })
    .loose()
    .refine((m) => typeof m.dataText === 'string' || typeof m.dataB64 === 'string', {
      message: 'request.chunk requires dataText or dataB64',
    }),
  z.object({ v: V, kind: z.literal('request.end'), id: z.int() }).loose(),
  z.object({ v: V, kind: z.literal('abort'), id: z.int() }).loose(),
  z
    .object({
      v: V,
      kind: z.literal('response.head'),
      id: z.int(),
      status: z.int(),
      headers: z.array(z.unknown()),
    })
    .loose(),
  z
    .object({
      v: V,
      kind: z.literal('response.chunk'),
      id: z.int(),
    })
    .loose()
    .refine((m) => typeof m.dataText === 'string' || typeof m.dataB64 === 'string', {
      message: 'response.chunk requires dataText or dataB64',
    }),
  z.object({ v: V, kind: z.literal('response.end'), id: z.int() }).loose(),
  z.object({ v: V, kind: z.literal('response.error'), id: z.int(), code: z.string() }).loose(),
]);

// ─── Public decode + encode API ────────────────────────────────────────────

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Decode a signaling frame received over the coordinator WebSocket.
 *
 * Returns `null` if the frame is malformed, has the wrong major protocol
 * version, has an unknown `kind`, or is missing required fields for its
 * kind. Unknown extra fields are preserved for forward compat.
 */
export function decodeSignaling(raw: string): SignalingMessage | null {
  const parsed = safeJsonParse(raw);
  const result = signalingSchema.safeParse(parsed);
  return result.success ? (result.data as SignalingMessage) : null;
}

/** Decode an RPC frame received over a data channel. */
export function decodeRpc(raw: string): RpcMessage | null {
  const parsed = safeJsonParse(raw);
  const result = rpcSchema.safeParse(parsed);
  return result.success ? (result.data as RpcMessage) : null;
}

/** Encode a signaling frame for transmission. Pure JSON.stringify. */
export function encodeSignaling(msg: SignalingMessage): string {
  return JSON.stringify(msg);
}

/** Encode an RPC frame for transmission. Pure JSON.stringify. */
export function encodeRpc(msg: RpcMessage): string {
  return JSON.stringify(msg);
}

// ─── Binary chunk frames ───────────────────────────────────────────────────
//
// Only `request.chunk` and `response.chunk` ever travel as binary — every
// other frame stays JSON-text so the protocol remains debuggable and
// forward-compat via the schema's `.loose()`. Body chunks are where the
// payload is, and base64-in-JSON costs ~33% bytes + non-trivial CPU on both
// encode and decode for multi-MB uploads/downloads.
//
// Wire layout (little-endian):
//   [0]    : kind tag (uint8)  0x01 = request.chunk, 0x02 = response.chunk
//   [1..4] : id (uint32)       — matches `id` in the corresponding RpcMessage
//   [5..]  : payload bytes     — the raw body slice, no framing
//
// The receiver demultiplexes on `typeof event.data === 'string'`: text is
// JSON, ArrayBuffer is one of these binary chunks. Both peers MUST advertise
// `binary-frames` in their hello caps before binary chunks may be sent; until
// then, the conservative default is base64-in-JSON for back-compat.

export type BinaryChunkKind = 'request.chunk' | 'response.chunk';

const BINARY_TAG_REQUEST_CHUNK = 0x01;
const BINARY_TAG_RESPONSE_CHUNK = 0x02;
const BINARY_HEADER_BYTES = 5;

export function encodeBinaryChunk(
  kind: BinaryChunkKind,
  id: number,
  payload: Uint8Array
): ArrayBuffer {
  const buffer = new ArrayBuffer(BINARY_HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, kind === 'request.chunk' ? BINARY_TAG_REQUEST_CHUNK : BINARY_TAG_RESPONSE_CHUNK);
  view.setUint32(1, id >>> 0, /* littleEndian */ true);
  new Uint8Array(buffer, BINARY_HEADER_BYTES).set(payload);
  return buffer;
}

export interface DecodedBinaryChunk {
  readonly kind: BinaryChunkKind;
  readonly id: number;
  readonly payload: Uint8Array;
}

export function decodeBinaryChunk(buffer: ArrayBuffer): DecodedBinaryChunk | null {
  if (buffer.byteLength < BINARY_HEADER_BYTES) {
    return null;
  }
  const view = new DataView(buffer);
  const tag = view.getUint8(0);
  let kind: BinaryChunkKind;
  if (tag === BINARY_TAG_REQUEST_CHUNK) {
    kind = 'request.chunk';
  } else if (tag === BINARY_TAG_RESPONSE_CHUNK) {
    kind = 'response.chunk';
  } else {
    return null;
  }
  const id = view.getUint32(1, /* littleEndian */ true);
  // View into the caller's buffer — callers MUST pass a buffer they own
  // (both the hub's `peer-session` and the FE/bootstrap already copy out
  // of the receive ring before calling).
  const payload = new Uint8Array(buffer, BINARY_HEADER_BYTES);
  return { kind, id, payload };
}
