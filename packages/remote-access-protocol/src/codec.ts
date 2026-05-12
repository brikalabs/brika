/**
 * Encoding & decoding helpers for the wire protocols.
 *
 * Both protocols use JSON text frames. Decoding does light structural
 * validation — enough to reject obviously malformed input from a peer that
 * speaks a different (or hostile) version — without locking us into a
 * specific schema library.
 *
 * All decoders return `null` on failure; callers MUST handle `null` as a
 * soft error (log + drop the frame) rather than throwing.
 */

import type { RpcMessage, RpcMessageKind } from './rpc';
import type { SignalingMessage, SignalingMessageKind } from './signaling';
import { PROTOCOL_VERSION } from './version';

const SIGNALING_KINDS = new Set<SignalingMessageKind>([
  'hub.register',
  'hub.answer',
  'hub.ice',
  'hub.abort',
  'client.offer',
  'client.ice',
  'client.abort',
  'session.offer',
  'session.answer',
  'session.ice',
  'session.iceServers',
  'session.error',
]);

const RPC_KINDS = new Set<RpcMessageKind>([
  'hello',
  'request',
  'abort',
  'response.head',
  'response.chunk',
  'response.end',
  'response.error',
]);

function parseEnvelope(raw: string): { v: unknown; kind: unknown; obj: unknown } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  return { v: obj.v, kind: obj.kind, obj };
}

/**
 * Decode a signaling frame received over the coordinator WebSocket.
 *
 * Returns `null` if the frame is malformed, has the wrong major protocol
 * version, or has an unknown `kind`. Unknown extra fields are preserved
 * (the caller gets the parsed JSON unchanged for forward-compat).
 */
export function decodeSignaling(raw: string): SignalingMessage | null {
  const env = parseEnvelope(raw);
  if (!env) {
    return null;
  }
  if (env.v !== PROTOCOL_VERSION) {
    return null;
  }
  if (typeof env.kind !== 'string' || !SIGNALING_KINDS.has(env.kind as SignalingMessageKind)) {
    return null;
  }
  return env.obj as SignalingMessage;
}

/** Decode an RPC frame received over a data channel. */
export function decodeRpc(raw: string): RpcMessage | null {
  const env = parseEnvelope(raw);
  if (!env) {
    return null;
  }
  if (env.v !== PROTOCOL_VERSION) {
    return null;
  }
  if (typeof env.kind !== 'string' || !RPC_KINDS.has(env.kind as RpcMessageKind)) {
    return null;
  }
  return env.obj as RpcMessage;
}

/** Encode a signaling frame for transmission. Pure JSON.stringify. */
export function encodeSignaling(msg: SignalingMessage): string {
  return JSON.stringify(msg);
}

/** Encode an RPC frame for transmission. Pure JSON.stringify. */
export function encodeRpc(msg: RpcMessage): string {
  return JSON.stringify(msg);
}
