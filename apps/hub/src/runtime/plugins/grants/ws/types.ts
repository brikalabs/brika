/**
 * Internal types and defaults for the `ws` grant family.
 */

import type { StreamEventType } from '@brika/ipc/contract';

/** Maximum simultaneously-open WebSocket connections per plugin. */
export const DEFAULT_MAX_OPEN_SOCKETS = 8;

/**
 * Maximum byte size for a single frame in either direction. Matches the
 * net.fetch body cap so plugins can't smuggle large bodies over WS.
 */
export const DEFAULT_MAX_FRAME_BYTES = 1 * 1024 * 1024;

/** Stream-event emitter the hub side uses to push frames at the plugin. */
export type StreamSink = (event: StreamEventType) => void;

/**
 * Minimal shape we need from a WebSocket implementation. Production
 * uses the global `WebSocket` (which Bun provides as a browser-equivalent);
 * tests pass a stub.
 */
export interface WsFactory {
  open(url: string, opts?: { protocols?: string[] }): WsConnection;
}

export interface WsConnection {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  readonly readyState: 0 | 1 | 2 | 3;
  set onopen(handler: () => void);
  set onmessage(handler: (data: string | Uint8Array) => void);
  set onclose(handler: (code: number, reason: string) => void);
  set onerror(handler: (message: string) => void);
}
