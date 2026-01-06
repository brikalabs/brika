/**
 * Functional SDK API
 *
 * Clean, simple exports for plugin development.
 *
 * @example
 * ```typescript
 * import { defineTool, log, emit, onStop, z } from "@brika/sdk";
 *
 * export const myTool = defineTool({
 *   id: "my-tool",
 *   schema: z.object({ name: z.string() }),
 * }, async (args) => {
 *   log("info", `Hello ${args.name}`);
 *   return { ok: true };
 * });
 *
 * onStop(() => {
 *   log("info", "Cleaning up...");
 * });
 * ```
 */

import type { Json } from '@brika/ipc';
import { z } from 'zod';
import { type EventHandler as CtxEventHandler, getContext, type LogLevel } from './context';
import type { AnyObj, ToolCallContext, ToolResult } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tool Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolSpec<TSchema extends z.ZodObject<z.ZodRawShape>> {
  /** Unique tool ID (must match package.json declaration) */
  id: string;
  /** Zod schema for input validation */
  schema: TSchema;
}

export interface CompiledTool {
  id: string;
}

/**
 * Define and register a tool.
 *
 * @example
 * ```typescript
 * export const greet = defineTool({
 *   id: "greet",
 *   schema: z.object({ name: z.string() }),
 * }, async ({ name }) => {
 *   return { ok: true, content: `Hello ${name}!` };
 * });
 * ```
 */
export function defineTool<TSchema extends z.ZodObject<z.ZodRawShape>>(
  spec: ToolSpec<TSchema>,
  handler: (args: z.infer<TSchema>, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult
): CompiledTool {
  return getContext().registerTool(spec, handler);
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a message to the hub.
 *
 * @example
 * ```typescript
 * log("info", "Timer started", { id: timer.id });
 * log("error", "Failed to connect");
 * ```
 */
export function log(level: LogLevel, message: string, meta?: AnyObj): void {
  getContext().log(level, message, meta);
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type EventPayload = { id: string; type: string; source: string; payload: Json; ts: number };
export type EventHandler = (event: EventPayload) => void;

/**
 * Emit an event to the hub's event bus.
 *
 * @example
 * ```typescript
 * emit("timer.completed", { id: timer.id, name: timer.name });
 * emit("motion.detected", { zone: "living-room" });
 * ```
 */
export function emit(eventType: string, payload: Json = null): void {
  getContext().emit(eventType, payload);
}

/**
 * Subscribe to events matching a pattern.
 * Returns an unsubscribe function.
 *
 * @example
 * ```typescript
 * const unsub = on("motion.*", (event) => {
 *   log("info", `Motion: ${event.type}`);
 * });
 * unsub();
 * ```
 */
export function on(pattern: string, handler: EventHandler): () => void {
  return getContext().onEvent(pattern, handler as CtxEventHandler);
}

/** Alias for `on` */
export const onEvent = on;

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export type StopHandler = () => void | Promise<void>;

/**
 * Register a cleanup handler that runs when the plugin stops.
 *
 * @example
 * ```typescript
 * onStop(() => {
 *   clearAllTimers();
 * });
 * ```
 */
export function onStop(fn: StopHandler): () => void {
  return getContext().onStop(fn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual Start
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Explicitly start the plugin.
 *
 * Usually not needed - the plugin auto-starts when the first tool
 * is defined. Use this for plugins that only listen to events.
 *
 * @example
 * ```typescript
 * import { start, on, log } from "@brika/sdk";
 *
 * on("motion.*", (event) => {
 *   log("info", `Motion detected: ${event.type}`);
 * });
 *
 * start();
 * ```
 */
export function start(): void {
  getContext().start();
}
