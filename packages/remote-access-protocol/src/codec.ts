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
      id: z.number().finite(),
      method: z.string(),
      url: z.string(),
      headers: z.array(z.unknown()),
    })
    .loose(),
  z.object({ v: V, kind: z.literal('abort'), id: z.number().finite() }).loose(),
  z
    .object({
      v: V,
      kind: z.literal('response.head'),
      id: z.number().finite(),
      status: z.number().finite(),
      headers: z.array(z.unknown()),
    })
    .loose(),
  z
    .object({
      v: V,
      kind: z.literal('response.chunk'),
      id: z.number().finite(),
    })
    .loose()
    .refine((m) => typeof m.dataText === 'string' || typeof m.dataB64 === 'string', {
      message: 'response.chunk requires dataText or dataB64',
    }),
  z.object({ v: V, kind: z.literal('response.end'), id: z.number().finite() }).loose(),
  z
    .object({ v: V, kind: z.literal('response.error'), id: z.number().finite(), code: z.string() })
    .loose(),
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
