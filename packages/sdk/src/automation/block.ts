/**
 * Block Definition System
 *
 * Simple, powerful block-based workflow blocks.
 * Same DX as defineTool() - Zod schema + handler.
 */

import { z } from "zod";
import type { Json } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Context - What blocks receive during execution
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockContext {
  /** Triggering event data */
  trigger: {
    type: string;
    payload: Json;
    source: string;
    ts: number;
  };
  /** Variables set during workflow */
  vars: Record<string, Json>;
  /** Previous block output */
  prev: Json;
  /** Loop item (when inside loop) */
  item?: Json;
  /** Loop index (when inside loop) */
  index?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime - Services available to blocks
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockRuntime {
  /** Call a tool */
  callTool(name: string, args: Record<string, Json>): Promise<Json>;
  /** Emit an event */
  emit(type: string, payload: Json): void;
  /** Log a message */
  log(level: "debug" | "info" | "warn" | "error", message: string): void;
  /** Execute another block by ID */
  runBlock(id: string): Promise<void>;
  /** Subscribe to events (for wait blocks) */
  subscribe(pattern: string, handler: (e: { type: string; payload: Json }) => void): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Result
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockResult {
  /** Next block ID (undefined = end) */
  next?: string;
  /** Output to set as prev for next block */
  output?: Json;
  /** Stop workflow */
  stop?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Definition
// ─────────────────────────────────────────────────────────────────────────────

export interface Block {
  type: string;
  name: string;
  icon: string;
  color: string;
  schema: z.ZodTypeAny;
  execute: (
    config: Record<string, unknown>,
    ctx: BlockContext,
    runtime: BlockRuntime,
  ) => Promise<BlockResult>;
}

/**
 * Define a block type
 *
 * @example
 * ```ts
 * export const actionBlock = defineBlock({
 *   type: "action",
 *   name: "Action",
 *   icon: "zap",
 *   color: "#3b82f6",
 *   schema: z.object({
 *     tool: z.string(),
 *     args: z.record(z.any()).optional(),
 *     next: z.string().optional(),
 *   }),
 * }, async (config, ctx, runtime) => {
 *   const result = await runtime.callTool(config.tool, expr(config.args ?? {}, ctx));
 *   return { next: config.next, output: result };
 * });
 * ```
 */
export function defineBlock<T extends z.ZodTypeAny>(
  spec: {
    type: string;
    name: string;
    icon: string;
    color: string;
    schema: T;
  },
  execute: (config: z.infer<T>, ctx: BlockContext, runtime: BlockRuntime) => Promise<BlockResult>,
): Block {
  return { ...spec, execute: execute as Block["execute"] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression Helper - Evaluate {{ expressions }}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate expressions in a value
 *
 * @example
 * expr("{{ trigger.payload.room }}", ctx) // => "living"
 * expr({ room: "{{ trigger.payload.room }}" }, ctx) // => { room: "living" }
 */
export function expr<T>(value: T, ctx: BlockContext): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // Full expression: {{ ... }}
    const match = value.match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (match) {
      return evalPath(match[1], ctx) as T;
    }
    // Template with embedded expressions
    if (value.includes("{{")) {
      return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, e) => {
        const result = evalPath(e.trim(), ctx);
        return result === null || result === undefined ? "" : String(result);
      }) as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => expr(v, ctx)) as T;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = expr(v, ctx);
    }
    return result as T;
  }

  return value;
}

function evalPath(path: string, ctx: BlockContext): Json {
  // Handle comparisons
  for (const op of ["===", "!==", "==", "!=", ">=", "<=", ">", "<"]) {
    const idx = path.indexOf(op);
    if (idx !== -1) {
      const left = evalPath(path.slice(0, idx).trim(), ctx);
      const right = parseValue(path.slice(idx + op.length).trim(), ctx);
      switch (op) {
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        case "==":
          return left == right;
        case "!=":
          return left != right;
        case ">=":
          return Number(left) >= Number(right);
        case "<=":
          return Number(left) <= Number(right);
        case ">":
          return Number(left) > Number(right);
        case "<":
          return Number(left) < Number(right);
      }
    }
  }

  // Simple path: trigger.payload.room
  const parts = path.split(".");
  let current: Json = ctx as unknown as Json;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (typeof current !== "object") return null;
    current = (current as Record<string, Json>)[part];
  }
  return current;
}

function parseValue(str: string, ctx: BlockContext): Json {
  // String literal
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return Number(str);
  }
  // Boolean
  if (str === "true") return true;
  if (str === "false") return false;
  // null
  if (str === "null") return null;
  // Path
  return evalPath(str, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration Helper
// ─────────────────────────────────────────────────────────────────────────────

/** Parse duration string to milliseconds */
export function parseDuration(dur: string | number): number {
  if (typeof dur === "number") return dur;
  const match = dur.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match) return 0;
  const [, num, unit = "ms"] = match;
  const n = parseFloat(num);
  switch (unit.toLowerCase()) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return n;
  }
}

// Re-export Zod
export { z } from "zod";
