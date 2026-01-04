/**
 * @elia/ipc - Smart Typed IPC
 *
 * Type-safe inter-process communication for ELIA plugins.
 *
 * @example Plugin side:
 * ```ts
 * import { createClient } from "@elia/ipc";
 * import { callTool, registerTool } from "@elia/ipc/contract";
 *
 * const client = createClient();
 *
 * client.implement(callTool, async ({ tool, args, ctx }) => {
 *   return { ok: true, content: "Done" };
 * });
 *
 * client.send(registerTool, { tool: { id: "set" } });
 * client.start({ id: "@elia/plugin-timer", version: "0.1.0" });
 * ```
 *
 * @example Hub side:
 * ```ts
 * import { spawnPlugin } from "@elia/ipc";
 * import { callTool, hello } from "@elia/ipc/contract";
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

export type { ChannelOptions, MessageHandler, RpcHandler, WireMessage } from './channel';
// ─── Channel ───
export { Channel } from './channel';
export type { ClientOptions } from './client';
// ─── Client ───
export { Client, createClient } from './client';
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
// ─── Definition Helpers ───
export { isMessage, isRpc, message, rpc } from './define';
export type { PluginChannelOptions } from './host';
// ─── Host ───
export { PluginChannel, spawnPlugin } from './host';
// ─── Core Types ───
export { Json, JsonRecord } from './types';
