/**
 * @brika/ipc - Smart Typed IPC
 *
 * Type-safe inter-process communication for BRIKA plugins.
 *
 * Uses Bun's native IPC with advanced serialization which supports:
 * - Uint8Array, ArrayBuffer (native binary, no base64!)
 * - Date, Map, Set, RegExp
 * - All structuredClone compatible types
 *
 * @see https://bun.sh/docs/runtime/child-process#inter-process-communication-ipc
 *
 * @example Plugin side:
 * ```ts
 * import { createClient } from "@brika/ipc";
 * import { callTool, registerTool } from "@brika/ipc/contract";
 *
 * const client = createClient();
 *
 * client.implement(callTool, async ({ tool, args, ctx }) => {
 *   return { ok: true, content: "Done" };
 * });
 *
 * client.send(registerTool, { tool: { id: "set" } });
 * client.start({ id: "@brika/plugin-timer", version: "0.1.0" });
 * ```
 *
 * @example Hub side:
 * ```ts
 * import { spawnPlugin } from "@brika/ipc";
 * import { callTool, hello } from "@brika/ipc/contract";
 *
 * const plugin = spawnPlugin("bun", ["./plugin.ts"]);
 *
 * plugin.on(hello, ({ plugin }) => console.log(plugin.id));
 *
 * const result = await plugin.call(callTool, {
 *   tool: "set", args: {}, ctx: { traceId: "x", source: "api" }
 * });
 * ```
 */

// ─── Channel ───
export type { ChannelOptions, MessageHandler, RpcHandler, WireMessage } from './channel';
export { Channel } from './channel';
export type { ChannelDelegateMethods } from './channel-delegate';

// ─── Client ───
export type { ClientOptions } from './client';
export { Client, createClient } from './client';
// ─── Definition Helpers ───
export type {
  AnyDef,
  Infer,
  InputOf,
  MessageDef,
  NameOf,
  OutputOf,
  PayloadOf,
  RpcDef,
} from './define';
export { isMessage, isRpc, message, rpc } from './define';
// ─── Errors ───
export type { RpcErrorCode, RpcErrorWire } from './errors';
export { isRpcErrorWire, RpcError } from './errors';
// ─── Host ───
export type { PluginChannelOptions, SpawnPluginOptions } from './host';
export { PluginChannel, spawnPlugin } from './host';

// ─── Global ───
export type { IpcGlobal } from './global';

// ─── Core Types ───
export { Json, JsonRecord } from './types';
