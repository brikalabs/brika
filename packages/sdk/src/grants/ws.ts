/**
 * `ctx.ws.*` — hub-mediated WebSocket connections.
 *
 * Stateful: the plugin holds a `handleId` string after `connect`, and
 * subsequent `send`/`close` calls reference it. Inbound frames arrive
 * via the `streamEvent` IPC message (see `@brika/ipc/contract/streams`).
 *
 * Scope grammar matches `net` (host patterns, `*.suffix` wildcards).
 * The hub-side handler also runs each connect through the same
 * private-IP filter the net grant uses — DNS rebinding to internal
 * space is rejected before the socket opens.
 */

import { defineGrant, type PermissionGate } from '@brika/grants';
import { z } from 'zod';

// ─── Scope ──────────────────────────────────────────────────────────────────

export const WsScopeSchema = z.object({
  /** Allow-listed WebSocket targets. Same pattern grammar as net.fetch. */
  allow: z.array(z.string()),
});

export type WsScope = z.infer<typeof WsScopeSchema>;

const WsPermission: PermissionGate<typeof WsScopeSchema> = {
  name: 'ws',
  scope: WsScopeSchema,
  defaultScope: { allow: [] },
  icon: 'plug',
};

// ─── connect ────────────────────────────────────────────────────────────────

export const WsConnectArgsSchema = z.object({
  url: z.url(),
  protocols: z.array(z.string()).optional(),
  /** Optional initial headers (subject to the same sanitisation as net.fetch). */
  headers: z.record(z.string(), z.string()).optional(),
});

export const WsConnectResultSchema = z.object({
  /** Opaque handle the plugin reuses for subsequent send/close calls. */
  handleId: z.string(),
});

export type WsConnectArgs = z.infer<typeof WsConnectArgsSchema>;
export type WsConnectResult = z.infer<typeof WsConnectResultSchema>;

export const wsConnect = defineGrant(
  {
    id: 'dev.brika.ws.connect',
    args: WsConnectArgsSchema,
    result: WsConnectResultSchema,
    permission: WsPermission,
    description: 'Open a WebSocket to an allow-listed host.',
    redact: {
      args: (args) => ({
        url: args.url,
        protocols: args.protocols,
        headerCount: args.headers === undefined ? 0 : Object.keys(args.headers).length,
      }),
    },
  },
  () => {
    throw new Error('ws.connect: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── send ───────────────────────────────────────────────────────────────────

export const WsSendArgsSchema = z.object({
  handleId: z.string(),
  /** String for text frames; Uint8Array for binary frames. */
  data: z.union([z.string(), z.instanceof(Uint8Array)]),
});

export const WsSendResultSchema = z.object({
  bytesSent: z.number().int().nonnegative(),
});

export type WsSendArgs = z.infer<typeof WsSendArgsSchema>;
export type WsSendResult = z.infer<typeof WsSendResultSchema>;

export const wsSend = defineGrant(
  {
    id: 'dev.brika.ws.send',
    args: WsSendArgsSchema,
    result: WsSendResultSchema,
    permission: WsPermission,
    description: 'Send a frame on an open WebSocket.',
    redact: {
      args: (args) => ({
        handleId: args.handleId,
        bytes: typeof args.data === 'string' ? args.data.length : args.data.byteLength,
      }),
    },
  },
  () => {
    throw new Error('ws.send: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── close ──────────────────────────────────────────────────────────────────

export const WsCloseArgsSchema = z.object({
  handleId: z.string(),
  code: z.number().int().min(1000).max(4999).optional(),
  reason: z.string().max(123).optional(),
});

export const WsCloseResultSchema = z.object({
  closed: z.boolean(),
});

export type WsCloseArgs = z.infer<typeof WsCloseArgsSchema>;
export type WsCloseResult = z.infer<typeof WsCloseResultSchema>;

export const wsClose = defineGrant(
  {
    id: 'dev.brika.ws.close',
    args: WsCloseArgsSchema,
    result: WsCloseResultSchema,
    permission: WsPermission,
    description: 'Close an open WebSocket.',
  },
  () => {
    throw new Error('ws.close: SDK-side handler invoked — hub must rebind before dispatch.');
  }
);

// ─── ctx augmentation ───────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    ws: {
      connect(args: WsConnectArgs): Promise<WsConnectResult>;
      send(args: WsSendArgs): Promise<WsSendResult>;
      close(args: WsCloseArgs): Promise<WsCloseResult>;
    };
  }
}
