/**
 * Block Definition API
 *
 * DX-focused API for defining event-driven blocks with Zod schemas.
 */

import { z } from 'zod';
import type { Json } from '../types';
import type {
  BlockHandlers,
  BlockPort,
  BlockSchema,
  CompiledBlock,
  LowLevelBlockContext,
  Serializable,
  SimplePort,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Block Builder Types
// ─────────────────────────────────────────────────────────────────────────────

/** Specification for defineBlock */
export interface BlockSpec<T extends z.ZodObject<z.ZodRawShape>> {
  /** Local block ID (without plugin prefix, e.g., "condition") */
  id: string;
  /** Display name (or i18n key) */
  name: string;
  /** Help text (or i18n key) */
  description: string;
  /** Category for grouping (e.g., "flow", "logic", "actions", "operators") */
  category: string;
  /** Lucide icon name */
  icon: string;
  /** Hex color */
  color: string;
  /** Input ports (omit for source blocks) */
  inputs?: SimplePort[];
  /** Output ports (omit for sink blocks) */
  outputs?: SimplePort[];
  /** Zod schema for configuration */
  schema: T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Define Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define an event-driven block type with full type safety.
 *
 * @example
 * ```ts
 * // Timer block - source block with no inputs
 * export const timerBlock = defineBlock({
 *   id: "timer",
 *   name: "Timer",
 *   description: "Emit events at regular intervals",
 *   category: "sources",
 *   icon: "clock",
 *   color: "#3b82f6",
 *   inputs: [],  // No inputs - this is a source block
 *   outputs: [{ id: "tick", name: "Tick" }],
 *   schema: z.object({
 *     interval: z.number().describe("Interval in milliseconds"),
 *   }),
 * }, {
 *   onStart(ctx) {
 *     const interval = ctx.config.interval as number;
 *     ctx.setInterval(() => {
 *       ctx.emit("tick", { ts: Date.now() });
 *     }, interval);
 *   },
 *   onInput() {
 *     // No inputs - not called
 *   },
 * });
 *
 * // Debounce block - operator block
 * export const debounceBlock = defineBlock({
 *   id: "debounce",
 *   name: "Debounce",
 *   description: "Wait for silence before emitting",
 *   category: "operators",
 *   icon: "timer",
 *   color: "#8b5cf6",
 *   inputs: [{ id: "in", name: "Input" }],
 *   outputs: [{ id: "out", name: "Output" }],
 *   schema: z.object({
 *     delay: z.number().describe("Delay in milliseconds"),
 *   }),
 * }, {
 *   onInput(portId, data, ctx) {
 *     // Store latest value
 *     ctx.state.set("latest", data);
 *
 *     // Cancel previous timer
 *     const cancel = ctx.state.get<() => void>("cancel");
 *     cancel?.();
 *
 *     // Set new timer
 *     const delay = ctx.config.delay as number;
 *     ctx.state.set("cancel", ctx.setTimeout(() => {
 *       const latest = ctx.state.get("latest");
 *       if (latest !== undefined) {
 *         ctx.emit("out", latest);
 *       }
 *     }, delay));
 *   },
 * });
 * ```
 */
export function defineBlock<T extends z.ZodObject<z.ZodRawShape>>(
  spec: BlockSpec<T>,
  handlers: BlockHandlers
): CompiledBlock {
  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(spec.schema);

  // Convert simple ports to full BlockPort with direction
  const inputs: BlockPort[] = (spec.inputs ?? []).map((p) => ({
    id: p.id,
    direction: 'input',
    nameKey: p.name,
    schema: p.schema,
  }));

  const outputs: BlockPort[] = (spec.outputs ?? []).map((p) => ({
    id: p.id,
    direction: 'output',
    nameKey: p.name,
    schema: p.schema,
  }));

  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    icon: spec.icon,
    color: spec.color,
    inputs,
    outputs,
    schema: jsonSchema,
    handlers: {
      onStart: handlers.onStart
        ? async (ctx) => {
            // Validate config before calling handler
            const parsed = spec.schema.safeParse(ctx.config);
            if (!parsed.success) {
              ctx.log('error', `Config validation failed: ${parsed.error.message}`);
              return;
            }
            await handlers.onStart?.(ctx);
          }
        : undefined,
      onInput: async (portId, data, ctx) => {
        // Validate config before calling handler
        const parsed = spec.schema.safeParse(ctx.config);
        if (!parsed.success) {
          ctx.log('error', `Config validation failed: ${parsed.error.message}`);
          return;
        }
        await handlers.onInput(portId, data, ctx);
      },
      onStop: handlers.onStop,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod to JSON Schema Converter
// ─────────────────────────────────────────────────────────────────────────────

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): BlockSchema {
  // Use Zod's native JSON Schema conversion
  const raw = z.toJSONSchema(schema, { unrepresentable: 'any' });

  const result: BlockSchema = {
    type: 'object',
    properties: {},
    required: [],
  };

  if (raw && typeof raw === 'object' && 'properties' in raw) {
    const props = raw.properties as Record<string, Record<string, unknown>>;
    const properties: BlockSchema['properties'] = {};

    for (const [key, prop] of Object.entries(props)) {
      properties[key] = {
        type: (prop.type as 'string' | 'number' | 'boolean' | 'array' | 'object') ?? 'string',
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
 * - Full expression: "{{ state.count }}"
 * - Template: "Count is {{ state.count }}"
 * - Comparisons: "{{ state.count > 10 }}"
 * - Nested objects: { count: "{{ state.count }}" }
 *
 * @example
 * expr("{{ state.count }}", ctx) // => 42
 * expr({ value: "{{ state.count }}" }, ctx) // => { value: 42 }
 */
export function expr<T>(value: T, ctx: { config: Record<string, unknown> }): T {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Full expression: {{ ... }}
    const match = value.match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (match && match[1]) {
      return evalPath(match[1], ctx) as T;
    }
    // Template with embedded expressions
    if (value.includes('{{')) {
      return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, e) => {
        const result = evalPath(e.trim(), ctx);
        return result === null || result === undefined ? '' : String(result);
      }) as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => expr(v, ctx)) as T;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = expr(v, ctx);
    }
    return result as T;
  }

  return value;
}

function evalPath(
  path: string,
  ctx: { config: Record<string, unknown> }
): Serializable | undefined {
  // Handle comparisons
  for (const op of ['===', '!==', '==', '!=', '>=', '<=', '>', '<', '&&', '||']) {
    const idx = path.indexOf(` ${op} `);
    if (idx !== -1) {
      const left = evalPath(path.slice(0, idx).trim(), ctx);
      const right = parseValue(path.slice(idx + op.length + 2).trim(), ctx);
      switch (op) {
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '>=':
          return Number(left) >= Number(right);
        case '<=':
          return Number(left) <= Number(right);
        case '>':
          return Number(left) > Number(right);
        case '<':
          return Number(left) < Number(right);
        case '&&':
          return Boolean(left) && Boolean(right);
        case '||':
          return Boolean(left) || Boolean(right);
      }
    }
  }

  // Handle negation
  if (path.startsWith('!')) {
    return !evalPath(path.slice(1).trim(), ctx);
  }

  // Simple path: config.interval
  const parts = path.split('.');
  let current: Serializable | undefined = ctx as unknown as Serializable;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object') return null;
    current = (current as { readonly [key: string]: Serializable | undefined })[part];
  }
  return current;
}

function parseValue(
  str: string,
  ctx: { config: Record<string, unknown> }
): Serializable | undefined {
  // String literal
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  // Number
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return Number(str);
  }
  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;
  // null
  if (str === 'null') return null;
  // Path
  return evalPath(str, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration Parser
// ─────────────────────────────────────────────────────────────────────────────

/** Parse duration string to milliseconds */
export function parseDuration(dur: string | number): number {
  if (typeof dur === 'number') return dur;
  const match = dur.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match || !match[1]) return 0;
  const [, num, unit = 'ms'] = match;
  const n = parseFloat(num);
  switch (unit.toLowerCase()) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return n;
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
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.icon === 'string' &&
    typeof obj.color === 'string' &&
    typeof obj.handlers === 'object' &&
    obj.handlers !== null &&
    typeof (obj.handlers as Record<string, unknown>).onInput === 'function' &&
    Array.isArray(obj.inputs) &&
    Array.isArray(obj.outputs)
  );
}

// Re-export Zod for convenience
export { z } from 'zod';
