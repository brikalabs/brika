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
 * version, has an unknown `kind`, or is missing required fields for its
 * kind. Unknown extra fields are preserved (the caller gets the parsed
 * JSON unchanged for forward-compat).
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
  if (
    !validateSignalingShape(env.kind as SignalingMessageKind, env.obj as Record<string, unknown>)
  ) {
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
  if (!validateRpcShape(env.kind as RpcMessageKind, env.obj as Record<string, unknown>)) {
    return null;
  }
  return env.obj as RpcMessage;
}

// Per-kind required-field checks. The wire is hostile by definition (any peer
// can craft a frame); we'd rather drop a malformed one than let `undefined`
// leak past the cast and crash deeper code.

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function isArr(v: unknown): boolean {
  return Array.isArray(v);
}

function validateSignalingShape(kind: SignalingMessageKind, m: Record<string, unknown>): boolean {
  switch (kind) {
    case 'hub.register':
      return isStr(m.name) && isStr(m.hubVersion);
    case 'hub.answer':
      return isStr(m.sessionId) && isStr(m.sdp);
    case 'hub.ice':
      return (
        isStr(m.sessionId) &&
        isObj(m.candidate) &&
        isStr((m.candidate as Record<string, unknown>).candidate)
      );
    case 'hub.abort':
      return isStr(m.sessionId);
    case 'client.offer':
      return isStr(m.hubName) && isStr(m.sdp);
    case 'client.ice':
      return (
        isStr(m.sessionId) &&
        isObj(m.candidate) &&
        isStr((m.candidate as Record<string, unknown>).candidate)
      );
    case 'client.abort':
      return isStr(m.sessionId);
    case 'session.offer':
      return isStr(m.sessionId) && isStr(m.sdp);
    case 'session.answer':
      return isStr(m.sessionId) && isStr(m.sdp);
    case 'session.ice':
      return (
        isStr(m.sessionId) &&
        isObj(m.candidate) &&
        isStr((m.candidate as Record<string, unknown>).candidate) &&
        (m.from === 'hub' || m.from === 'client')
      );
    case 'session.iceServers':
      return isArr(m.iceServers);
    case 'session.error':
      return isStr(m.code);
  }
}

function validateRpcShape(kind: RpcMessageKind, m: Record<string, unknown>): boolean {
  switch (kind) {
    case 'hello':
      return (m.role === 'hub' || m.role === 'client') && isStr(m.softwareVersion);
    case 'request':
      return isNum(m.id) && isStr(m.method) && isStr(m.url) && isArr(m.headers);
    case 'abort':
      return isNum(m.id);
    case 'response.head':
      return isNum(m.id) && isNum(m.status) && isArr(m.headers);
    case 'response.chunk':
      return isNum(m.id) && (isStr(m.dataText) || isStr(m.dataB64));
    case 'response.end':
      return isNum(m.id);
    case 'response.error':
      return isNum(m.id) && isStr(m.code);
  }
}

/** Encode a signaling frame for transmission. Pure JSON.stringify. */
export function encodeSignaling(msg: SignalingMessage): string {
  return JSON.stringify(msg);
}

/** Encode an RPC frame for transmission. Pure JSON.stringify. */
export function encodeRpc(msg: RpcMessage): string {
  return JSON.stringify(msg);
}
