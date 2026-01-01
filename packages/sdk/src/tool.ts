/**
 * Type-safe Tool Definition with Zod 4
 * 
 * Uses Zod 4's native JSON Schema conversion for fully typed tool handlers
 * @see https://zod.dev/json-schema
 */

import { z } from "zod";
import type { ToolCallContext, ToolResult, ToolInputSchema, Json } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CompiledTool {
  /** Local ID (without plugin prefix) */
  id: string;
  /** Full qualified name (with plugin prefix, set on registration) */
  name?: string;
  description?: string;
  inputSchema?: ToolInputSchema;
  // biome-ignore lint/suspicious/noExplicitAny: internal use
  handler: (args: any, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a type-safe tool definition using Zod 4
 * 
 * The tool will be registered with a plugin prefix: `pluginId:toolId`
 * 
 * @example
 * ```ts
 * import { defineTool, z } from "@elia/sdk";
 * 
 * // In plugin "timer", this becomes "timer:set"
 * const setTimer = defineTool({
 *   id: "set",
 *   description: "Set a timer",
 *   schema: z.object({
 *     name: z.string().optional().describe("Timer name"),
 *     seconds: z.number().min(1).max(86400).describe("Duration in seconds"),
 *   }),
 * }, async (args) => {
 *   // args is fully typed: { name?: string; seconds: number }
 *   return { ok: true, content: `Timer ${args.name} set for ${args.seconds}s` };
 * });
 * ```
 */
export function defineTool<TSchema extends z.ZodObject<z.ZodRawShape>>(
  spec: {
    id: string;
    description?: string;
    schema: TSchema;
  },
  handler: (args: z.infer<TSchema>, ctx: ToolCallContext) => Promise<ToolResult> | ToolResult
): CompiledTool {
  // Use Zod 4's native JSON Schema conversion
  const jsonSchema = z.toJSONSchema(spec.schema, {
    unrepresentable: "any",
  });

  // Extract the relevant parts for our ToolInputSchema format
  const inputSchema: ToolInputSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  if (jsonSchema && typeof jsonSchema === "object" && "properties" in jsonSchema) {
    const props = jsonSchema.properties as Record<string, Record<string, unknown>>;
    
    for (const [key, prop] of Object.entries(props)) {
      inputSchema.properties![key] = {
        type: (prop.type as "string" | "number" | "boolean") ?? "string",
        description: prop.description as string | undefined,
        default: prop.default as Json | undefined,
        enum: prop.enum as Json[] | undefined,
      };
    }

    if (Array.isArray(jsonSchema.required)) {
      inputSchema.required = jsonSchema.required as string[];
    }
  }

  return {
    id: spec.id,
    description: spec.description,
    inputSchema,
    handler: async (args, ctx) => {
      // Validate and parse with Zod
      const parsed = spec.schema.safeParse(args);
      if (!parsed.success) {
        const issues = parsed.error.issues || [];
        const errors = issues.map((e) => `${String(e.path?.join?.(".") ?? "")}: ${e.message}`).join(", ");
        return { ok: false, content: `Validation error: ${errors}` };
      }
      return handler(parsed.data as z.infer<TSchema>, ctx);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard to check if a value is a CompiledTool
 * Used by plugin loader for auto-registration
 */
export function isCompiledTool(value: unknown): value is CompiledTool {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.handler === "function" &&
    (obj.description === undefined || typeof obj.description === "string") &&
    (obj.inputSchema === undefined || typeof obj.inputSchema === "object")
  );
}

// Re-export Zod for convenience
export { z } from "zod";
