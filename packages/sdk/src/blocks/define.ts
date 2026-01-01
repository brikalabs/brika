/**
 * Block Definition API
 * 
 * DX-focused API for defining blocks with Zod schemas.
 * Mirrors the defineTool() pattern for consistency.
 */

import { z } from "zod";
import type { Json } from "../types";
import type {
  BlockPort,
  BlockSchema,
  BlockContext,
  BlockRuntime,
  BlockResult,
  BlockHandler,
  CompiledBlock,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Block Builder Types
// ─────────────────────────────────────────────────────────────────────────────

/** Specification for defineBlock */
export interface BlockSpec<T extends z.ZodObject<z.ZodRawShape>> {
  /** Local block ID (without plugin prefix, e.g., "condition") */
  id: string;
  /** Display name */
  name: string;
  /** Help text */
  description: string;
  /** Category for grouping (e.g., "flow", "logic", "actions") */
  category: string;
  /** Lucide icon name */
  icon: string;
  /** Hex color */
  color: string;
  /** Input ports (omit for trigger/start blocks) */
  inputs?: BlockPort[];
  /** Output ports (omit for terminal blocks) */
  outputs?: BlockPort[];
  /** Zod schema for configuration */
  schema: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Define Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a block type with full type safety
 * 
 * The block will be registered with a plugin prefix: `pluginId:blockId`
 * 
 * @example
 * ```ts
 * // In plugin "blocks-builtin", this becomes "blocks-builtin:condition"
 * export const conditionBlock = defineBlock({
 *   id: "condition",
 *   name: "Condition",
 *   description: "Branch based on a condition",
 *   category: "flow",
 *   icon: "git-branch",
 *   color: "#f59e0b",
 *   inputs: [{ id: "in", name: "Input" }],
 *   outputs: [
 *     { id: "then", name: "Then" },
 *     { id: "else", name: "Else" },
 *   ],
 *   schema: z.object({
 *     if: z.string().describe("Condition expression"),
 *   }),
 * }, async (config, ctx, runtime) => {
 *   const result = runtime.evaluate(config.if, ctx);
 *   return { output: result ? "then" : "else", data: result };
 * });
 * ```
 */
export function defineBlock<T extends z.ZodObject<z.ZodRawShape>>(
  spec: BlockSpec<T>,
  handler: (config: z.infer<T>, ctx: BlockContext, runtime: BlockRuntime) => Promise<BlockResult> | BlockResult
): CompiledBlock {
  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(spec.schema);

  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    icon: spec.icon,
    color: spec.color,
    inputs: spec.inputs ?? [{ id: "in", name: "Input" }],
    outputs: spec.outputs ?? [{ id: "out", name: "Output" }],
    schema: jsonSchema,
    execute: async (config, ctx, runtime) => {
      // Validate config with Zod
      const parsed = spec.schema.safeParse(config);
      if (!parsed.success) {
        const issues = parsed.error.issues || [];
        const errors = issues.map((e) => `${String(e.path?.join?.(".") ?? "")}: ${e.message}`).join(", ");
        return { error: `Config validation failed: ${errors}`, stop: true };
      }
      return handler(parsed.data as z.infer<T>, ctx, runtime);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod to JSON Schema Converter
// ─────────────────────────────────────────────────────────────────────────────

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): BlockSchema {
  // Use Zod's native JSON Schema conversion
  const raw = z.toJSONSchema(schema, { unrepresentable: "any" });
  
  const result: BlockSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  if (raw && typeof raw === "object" && "properties" in raw) {
    const props = raw.properties as Record<string, Record<string, unknown>>;
    const properties: BlockSchema["properties"] = {};
    
    for (const [key, prop] of Object.entries(props)) {
      properties[key] = {
        type: (prop.type as "string" | "number" | "boolean" | "array" | "object") ?? "string",
        description: prop.description as string | undefined,
        default: prop.default as Json | undefined,
        enum: prop.enum as Json[] | undefined,
      };
    }
    
    result.properties = properties;

    if (Array.isArray(raw.required)) {
      result.required = raw.required as string[];
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression Evaluator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate expressions in a value
 * 
 * Supports:
 * - Full expression: "{{ trigger.payload.room }}"
 * - Template: "Room is {{ trigger.payload.room }}"
 * - Comparisons: "{{ trigger.payload.value > 10 }}"
 * - Nested objects: { room: "{{ trigger.payload.room }}" }
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
    return value.map(v => expr(v, ctx)) as T;
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
  for (const op of ["===", "!==", "==", "!=", ">=", "<=", ">", "<", "&&", "||"]) {
    const idx = path.indexOf(` ${op} `);
    if (idx !== -1) {
      const left = evalPath(path.slice(0, idx).trim(), ctx);
      const right = parseValue(path.slice(idx + op.length + 2).trim(), ctx);
      switch (op) {
        case "===": return left === right;
        case "!==": return left !== right;
        case "==": return left == right;
        case "!=": return left != right;
        case ">=": return Number(left) >= Number(right);
        case "<=": return Number(left) <= Number(right);
        case ">": return Number(left) > Number(right);
        case "<": return Number(left) < Number(right);
        case "&&": return Boolean(left) && Boolean(right);
        case "||": return Boolean(left) || Boolean(right);
      }
    }
  }

  // Handle negation
  if (path.startsWith("!")) {
    return !evalPath(path.slice(1).trim(), ctx);
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
// Duration Parser
// ─────────────────────────────────────────────────────────────────────────────

/** Parse duration string to milliseconds */
export function parseDuration(dur: string | number): number {
  if (typeof dur === "number") return dur;
  const match = dur.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match) return 0;
  const [, num, unit = "ms"] = match;
  const n = parseFloat(num);
  switch (unit.toLowerCase()) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return n;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard to check if a value is a CompiledBlock
 * Used by plugin loader for auto-registration
 */
export function isCompiledBlock(value: unknown): value is CompiledBlock {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.description === "string" &&
    typeof obj.category === "string" &&
    typeof obj.icon === "string" &&
    typeof obj.color === "string" &&
    typeof obj.execute === "function" &&
    Array.isArray(obj.inputs) &&
    Array.isArray(obj.outputs)
  );
}

// Re-export Zod for convenience
export { z } from "zod";

