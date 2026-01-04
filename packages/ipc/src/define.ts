/**
 * Contract Definition Helpers
 *
 * Type-safe helpers for defining IPC messages and RPCs.
 * Each definition carries its type information for full inference.
 */

import type { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Type Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Infer the TypeScript type from a Zod schema */
export type Infer<T> = T extends z.ZodType<infer U> ? U : never;

// ─────────────────────────────────────────────────────────────────────────────
// Message Definition (Fire-and-Forget)
// ─────────────────────────────────────────────────────────────────────────────

/** A message definition with its schema */
export interface MessageDef<N extends string = string, S extends z.ZodType = z.ZodType> {
  readonly _tag: 'message';
  readonly name: N;
  readonly schema: S;
}

/**
 * Define a fire-and-forget message
 *
 * @example
 * ```ts
 * export const hello = message("hello", z.object({
 *   plugin: PluginInfo,
 * }));
 *
 * // Usage
 * client.send(hello, { plugin: { id: "...", version: "..." } });
 * ```
 */
export function message<N extends string, S extends z.ZodType>(
  name: N,
  schema: S
): MessageDef<N, S> {
  return {
    _tag: 'message',
    name,
    schema,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC Definition (Request/Response)
// ─────────────────────────────────────────────────────────────────────────────

/** An RPC definition with input and output schemas */
export interface RpcDef<
  N extends string = string,
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> {
  readonly _tag: 'rpc';
  readonly name: N;
  readonly input: I;
  readonly output: O;
}

/**
 * Define a request/response RPC
 *
 * @example
 * ```ts
 * export const callTool = rpc("callTool",
 *   z.object({ tool: z.string(), args: z.record(Json) }),
 *   ToolResult,
 * );
 *
 * // Server implements
 * host.implement(callTool, async ({ tool, args }) => {
 *   return { ok: true };
 * });
 *
 * // Client calls
 * const result = await client.call(callTool, { tool: "set", args: {} });
 * ```
 */
export function rpc<N extends string, I extends z.ZodType, O extends z.ZodType>(
  name: N,
  input: I,
  output: O
): RpcDef<N, I, O> {
  return {
    _tag: 'rpc',
    name,
    input,
    output,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Extraction Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the name from a definition */
export type NameOf<T> =
  T extends MessageDef<infer N, unknown>
    ? N
    : T extends RpcDef<infer N, unknown, unknown>
      ? N
      : never;

/** Extract the payload type from a message */
export type PayloadOf<T> = T extends MessageDef<string, infer S> ? Infer<S> : never;

/** Extract the input type from an RPC */
export type InputOf<T> = T extends RpcDef<string, infer I, unknown> ? Infer<I> : never;

/** Extract the output type from an RPC */
export type OutputOf<T> = T extends RpcDef<string, unknown, infer O> ? Infer<O> : never;

/** Any definition (message or RPC) */
export type AnyDef = MessageDef | RpcDef;

/** Check if definition is a message */
export function isMessage(def: AnyDef): def is MessageDef {
  return def._tag === 'message';
}

/** Check if definition is an RPC */
export function isRpc(def: AnyDef): def is RpcDef {
  return def._tag === 'rpc';
}
