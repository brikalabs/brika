/**
 * Functional SDK API
 *
 * Clean, simple exports for plugin development.
 * Import what you need, no boilerplate required.
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
import type { BlockHandlers, CompiledBlock } from './blocks';
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
 * The tool ID must be declared in your plugin's `package.json`:
 * ```json
 * {
 *   "tools": [{ "id": "my-tool", "description": "...", "icon": "...", "color": "..." }]
 * }
 * ```
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
// Block Definition (Event-Driven)
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockSpec<TSchema extends z.ZodObject<z.ZodRawShape>> {
  /** Unique block ID (must match package.json declaration) */
  id: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Category for grouping */
  category?: string;
  /** Lucide icon name */
  icon?: string;
  /** Hex color */
  color?: string;
  /** Input ports */
  inputs?: Array<{ id: string; name: string }>;
  /** Output ports */
  outputs?: Array<{ id: string; name: string }>;
  /** Zod schema for configuration */
  schema: TSchema;
}

export interface CompiledBlockRef {
  id: string;
}

/**
 * Define and register an event-driven block.
 *
 * The block ID must be declared in your plugin's `package.json`:
 * ```json
 * {
 *   "blocks": [{ "id": "my-block", "name": "...", "category": "...", "icon": "...", "color": "..." }]
 * }
 * ```
 *
 * @example
 * ```typescript
 * export const timer = defineBlock({
 *   id: "timer",
 *   inputs: [],  // No inputs - source block
 *   outputs: [{ id: "tick", name: "Tick" }],
 *   schema: z.object({ interval: z.number() }),
 * }, {
 *   onStart(ctx) {
 *     const interval = ctx.config.interval as number;
 *     ctx.setInterval(() => {
 *       ctx.emit("tick", { ts: Date.now() });
 *     }, interval);
 *   },
 *   onInput() {
 *     // Not called - no inputs
 *   },
 * });
 * ```
 */
export function defineBlock<TSchema extends z.ZodObject<z.ZodRawShape>>(
  spec: BlockSpec<TSchema>,
  handlers: BlockHandlers
): CompiledBlockRef {
  // Convert to CompiledBlock format
  const block: CompiledBlock = {
    id: spec.id,
    name: spec.name ?? spec.id,
    description: spec.description ?? '',
    category: spec.category ?? 'action',
    icon: spec.icon ?? 'box',
    color: spec.color ?? '#6b7280',
    inputs: (spec.inputs ?? []).map((p) => ({
      id: p.id,
      direction: 'input' as const,
      nameKey: p.name,
    })),
    outputs: (spec.outputs ?? []).map((p) => ({
      id: p.id,
      direction: 'output' as const,
      nameKey: p.name,
    })),
    schema: zodToBlockSchema(spec.schema),
    handlers,
  };

  return getContext().useBlock(block);
}

function zodToBlockSchema(schema: z.ZodObject<z.ZodRawShape>) {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' });
  const props =
    (json as { properties?: Record<string, { type?: string; description?: string }> }).properties ??
    {};
  type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array';
  const validTypes = new Set<PropType>(['string', 'number', 'boolean', 'object', 'array']);
  return {
    type: 'object' as const,
    properties: Object.fromEntries(
      Object.entries(props).map(([k, v]) => [
        k,
        {
          type: (validTypes.has(v.type as PropType) ? v.type : 'string') as PropType,
          description: v.description,
        },
      ])
    ),
    required: (json as { required?: string[] }).required ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Use Block (Alternative API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a pre-compiled block (created with defineBlock from @brika/sdk/blocks).
 *
 * @example
 * ```typescript
 * import { useBlock } from "@brika/sdk";
 * import { timerBlock } from "./blocks/timer";
 *
 * useBlock(timerBlock);
 * ```
 */
export function useBlock(block: CompiledBlock): CompiledBlockRef {
  return getContext().useBlock(block);
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
 * Patterns support wildcards:
 * - `*` matches any characters within a segment
 * - `motion.*` matches `motion.detected`, `motion.ended`, etc.
 *
 * @example
 * ```typescript
 * // Subscribe to all motion events
 * const unsub = on("motion.*", (event) => {
 *   log("info", `Motion: ${event.type}`);
 * });
 *
 * // Later, unsubscribe
 * unsub();
 * ```
 */
export function on(pattern: string, handler: EventHandler): () => void {
  return getContext().onEvent(pattern, handler as CtxEventHandler);
}

/**
 * Alias for `on` - subscribe to events matching patterns.
 */
export const onEvent = on;

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export type StopHandler = () => void | Promise<void>;

/**
 * Register a cleanup handler that runs when the plugin stops.
 * Returns an unsubscribe function.
 *
 * Can be called at plugin root level or inside functions:
 *
 * @example
 * ```typescript
 * // Root level - always runs on stop
 * onStop(() => {
 *   clearAllTimers();
 * });
 *
 * // Inside a function - scoped cleanup
 * function setupTimer(seconds: number) {
 *   const timeout = setTimeout(...);
 *
 *   // Register cleanup for this specific timer
 *   const unsub = onStop(() => clearTimeout(timeout));
 *
 *   return () => {
 *     clearTimeout(timeout);
 *     unsub(); // Remove listener when timer completes
 *   };
 * }
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
 * Usually not needed - the plugin auto-starts when the first tool/block
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
 * start(); // Start without defining any tools
 * ```
 */
export function start(): void {
  getContext().start();
}
