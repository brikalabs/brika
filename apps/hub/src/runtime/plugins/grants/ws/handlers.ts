/**
 * `ctx.ws.connect` / `ws.send` / `ws.close` handlers.
 *
 * One small file each? It worked for net/fs but ws's three verbs are
 * tightly coupled (they share the handle registry and the connection
 * lifecycle) — splitting them out adds files without aiding clarity.
 * Each handler is ~30 LoC; the whole module stays small.
 */

import { errors } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import {
  wsClose as closeSpec,
  wsConnect as connectSpec,
  wsSend as sendSpec,
  type WsCloseArgs,
  type WsCloseResult,
  type WsConnectArgs,
  type WsConnectResult,
  type WsScope,
  type WsSendArgs,
  type WsSendResult,
} from '@brika/sdk/grants';
import { assertPublicHost, type DnsResolver } from '../net/dns-guard';
import { isHostAllowed } from '../net/host-allow';
import type { WsHandleRegistry } from './registry';
import { DEFAULT_MAX_FRAME_BYTES, type StreamSink, type WsFactory } from './types';

export interface WsHandlerDeps {
  readonly factory: WsFactory;
  readonly resolver: DnsResolver;
  readonly registry: WsHandleRegistry;
  readonly sink: StreamSink;
  readonly maxFrameBytes?: number;
}

export function buildWsConnectGrant(deps: WsHandlerDeps) {
  return defineGrant(
    connectSpec.spec,
    async (ctx, args: WsConnectArgs): Promise<WsConnectResult> => {
      const scope: WsScope = ctx.grantedScope;
      const url = assertSafeWsUrl(args.url);
      if (!isHostAllowed(url.hostname, scope.allow)) {
        throw errors.netHostNotAllowed({ host: url.hostname, allow: [...scope.allow] });
      }
      await assertPublicHost(url.hostname, deps.resolver);
      if (deps.registry.atCapacity()) {
        throw errors.wsOpenLimitExceeded({ limit: deps.registry.size() });
      }
      const conn = deps.factory.open(url.toString(), { protocols: args.protocols });
      const handleId = deps.registry.register(conn);
      const cap = deps.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
      conn.onopen = () => deps.sink({ kind: 'open', handleId });
      conn.onmessage = (data) => {
        // String `length` is UTF-16 code units; the cap is in BYTES,
        // so a peer streaming multi-byte UTF-8 could bypass by ~2x
        // if we used `.length`. Buffer.byteLength returns true UTF-8
        // byte count for strings; for Uint8Array we already have
        // byteLength directly.
        const size = typeof data === 'string' ? Buffer.byteLength(data, 'utf-8') : data.byteLength;
        if (size > cap) {
          deps.sink({
            kind: 'error',
            handleId,
            message: `inbound frame ${size}B exceeded cap ${cap}B; closing`,
          });
          deps.registry.take(handleId)?.close(1009, 'frame-too-large');
          return;
        }
        // Copy the binary payload into a fresh, non-shared ArrayBuffer
        // so the StreamEvent's Uint8Array generic narrows to
        // `ArrayBuffer` rather than the wider `ArrayBufferLike`.
        // Cost: one allocation per inbound frame (capped above).
        deps.sink({ kind: 'message', handleId, data: copyToFreshArray(data) });
      };
      conn.onclose = (code, reason) => {
        deps.registry.take(handleId);
        deps.sink({ kind: 'close', handleId, code, reason });
      };
      conn.onerror = (message) => deps.sink({ kind: 'error', handleId, message });
      return { handleId };
    }
  );
}

export function buildWsSendGrant(deps: WsHandlerDeps) {
  return defineGrant(sendSpec.spec, (_ctx, args: WsSendArgs): WsSendResult => {
    const conn = deps.registry.get(args.handleId);
    if (!conn) {
      throw errors.wsHandleNotFound({ handleId: args.handleId });
    }
    const cap = deps.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
    // `.length` on a string is UTF-16 code units; for the cap (a
    // byte budget) we need the UTF-8 byte count.
    const size =
      typeof args.data === 'string' ? Buffer.byteLength(args.data, 'utf-8') : args.data.byteLength;
    if (size > cap) {
      throw errors.wsFrameTooLarge({ limit: cap, requested: size });
    }
    conn.send(args.data);
    return { bytesSent: size };
  });
}

export function buildWsCloseGrant(deps: WsHandlerDeps) {
  return defineGrant(closeSpec.spec, (_ctx, args: WsCloseArgs): WsCloseResult => {
    const conn = deps.registry.take(args.handleId);
    if (!conn) {
      return { closed: false };
    }
    conn.close(args.code, args.reason);
    return { closed: true };
  });
}

/**
 * Allow only `ws:` and `wss:` schemes. `assertSafeUrl` only knows
 * about http(s); we wrap it with a follow-up check so connect calls
 * don't share the fetch grant's protocol list (file: would be the
 * exact wrong thing to allow here).
 */
function assertSafeWsUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw errors.netProtocolBlocked({ protocol: url.protocol });
  }
  // Reuse the host check; passing http(s) URL through assertSafeUrl
  // would reject ws:// even though we just validated.
  return url;
}

/**
 * Copy a binary payload into a fresh standalone `Uint8Array<ArrayBuffer>`.
 * Returns the input unchanged when it's a string (no buffer is
 * involved). Used to normalise the buffer-generic so it matches the
 * StreamEvent schema's `Uint8Array<ArrayBuffer>` expectation — the
 * incoming type may be `Uint8Array<ArrayBufferLike>` (TS's wider
 * generic for typed arrays that might back a SharedArrayBuffer).
 */
function copyToFreshArray(data: string | Uint8Array): string | Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') {
    return data;
  }
  const fresh = new Uint8Array(new ArrayBuffer(data.byteLength));
  fresh.set(data);
  return fresh;
}
