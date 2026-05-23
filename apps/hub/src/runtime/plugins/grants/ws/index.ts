/**
 * Hub-side `ctx.ws.*` grant family — entry point.
 *
 * Constructs a per-plugin `WsHandleRegistry` and binds the three
 * connect / send / close handlers against it. The returned grants are
 * registered alongside net + dns + fs in `registry-factory.ts`.
 */

import type { Grant } from '@brika/grants';
import { type DnsResolver, defaultDnsResolver } from '../net/dns-guard';
import { buildWsCloseGrant, buildWsConnectGrant, buildWsSendGrant } from './handlers';
import { WsHandleRegistry } from './registry';
import {
  DEFAULT_MAX_FRAME_BYTES,
  DEFAULT_MAX_OPEN_SOCKETS,
  type StreamSink,
  type WsConnection,
  type WsFactory,
} from './types';

export type { StreamSink, WsConnection, WsFactory } from './types';

export interface WsGrantOptions {
  /**
   * Stream-event sink. The prelude installs the per-plugin Channel
   * here so hub-side message/close/error events route to the plugin's
   * stream dispatcher.
   */
  readonly sink: StreamSink;
  /** Override the WebSocket factory. Production passes the default below. */
  readonly factory?: WsFactory;
  /** Override the DNS resolver used for the rebind check. */
  readonly resolver?: DnsResolver;
  readonly maxOpenSockets?: number;
  readonly maxFrameBytes?: number;
}

/**
 * Default factory: thin wrapper around the global `WebSocket` Bun
 * provides as a browser-equivalent.
 */
export const defaultWsFactory: WsFactory = {
  open(url, opts) {
    const ws = new WebSocket(url, opts?.protocols);
    // Default handlers are no-ops; the grant rebinds them via the
    // setters below. Named functions (rather than `() => {}`) keep
    // biome's noEmptyBlockStatements happy.
    let openHandler: () => void = noopOpen;
    let messageHandler: (data: string | Uint8Array) => void = noopMessage;
    let closeHandler: (code: number, reason: string) => void = noopClose;
    let errorHandler: (message: string) => void = noopError;
    ws.addEventListener('open', () => openHandler());
    ws.addEventListener('message', (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data);
      messageHandler(data);
    });
    ws.addEventListener('close', (ev) => closeHandler(ev.code, ev.reason));
    ws.addEventListener('error', () => errorHandler('websocket error'));
    const conn: WsConnection = {
      get readyState() {
        // Cast to the constrained union; WebSocket.readyState is `number`
        // in some lib types, but the spec guarantees 0|1|2|3.
        const s = ws.readyState;
        if (s === 0 || s === 1 || s === 2 || s === 3) {
          return s;
        }
        return 3;
      },
      send(data: string | Uint8Array) {
        ws.send(data);
      },
      close(code?: number, reason?: string) {
        ws.close(code, reason);
      },
      set onopen(h: () => void) {
        openHandler = h;
      },
      set onmessage(h: (data: string | Uint8Array) => void) {
        messageHandler = h;
      },
      set onclose(h: (code: number, reason: string) => void) {
        closeHandler = h;
      },
      set onerror(h: (message: string) => void) {
        errorHandler = h;
      },
    };
    return conn;
  },
};

// Named no-op handlers — keep the default-handler slots non-empty
// without falling back to the `() => {}` form biome flags.
function noopOpen(): void {
  // Intentional no-op: handler is rebound before the WebSocket opens.
}
function noopMessage(_data: string | Uint8Array): void {
  // Intentional no-op: rebound before the first inbound frame.
}
function noopClose(_code: number, _reason: string): void {
  // Intentional no-op: rebound before close events arrive.
}
function noopError(_message: string): void {
  // Intentional no-op: rebound before error events arrive.
}

export function buildWsGrants(opts: WsGrantOptions): {
  grants: ReadonlyArray<Grant>;
  registry: WsHandleRegistry;
} {
  const registry = new WsHandleRegistry(opts.maxOpenSockets ?? DEFAULT_MAX_OPEN_SOCKETS);
  const deps = {
    factory: opts.factory ?? defaultWsFactory,
    resolver: opts.resolver ?? defaultDnsResolver,
    registry,
    sink: opts.sink,
    maxFrameBytes: opts.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES,
  };
  return {
    grants: [buildWsConnectGrant(deps), buildWsSendGrant(deps), buildWsCloseGrant(deps)],
    registry,
  };
}
