/**
 * Tools Contract
 *
 * Tool registration and invocation
 */

import { z } from 'zod';
import { message, rpc } from '../define';
import { Json, JsonRecord } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ToolCallSource = z.enum(['api', 'ui', 'voice', 'rule', 'automation']);
export type ToolCallSource = z.infer<typeof ToolCallSource>;

export const ToolCallContext = z.object({
  traceId: z.string(),
  source: ToolCallSource,
});
export type ToolCallContext = z.infer<typeof ToolCallContext>;

export const ToolResult = z.object({
  ok: z.boolean(),
  content: z.string().optional(),
  data: Json.optional(),
});
export type ToolResult = z.infer<typeof ToolResult>;

// Extra JSON Schema keywords (minimum, maximum, nested properties, ...) are
// kept via catchall(Json) so zod-derived schemas reach the model intact while
// every value stays Json-typed for the bridge.
export const ToolInputSchemaProperty = z
  .object({
    type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    default: Json.optional(),
    enum: z.array(Json).optional(),
    items: z
      .object({
        type: z.string(),
      })
      .catchall(Json)
      .optional(),
    required: z.boolean().optional(),
  })
  .catchall(Json);
export type ToolInputSchemaProperty = z.infer<typeof ToolInputSchemaProperty>;

export const ToolInputSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), ToolInputSchemaProperty).optional(),
  required: z.array(z.string()).optional(),
});
export type ToolInputSchema = z.infer<typeof ToolInputSchema>;

export const ToolDefinition = z.object({
  id: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  inputSchema: ToolInputSchema.optional(),
});
export type ToolDefinition = z.infer<typeof ToolDefinition>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers a tool with the hub */
export const registerTool = message(
  'registerTool',
  z.object({
    tool: ToolDefinition,
  })
);

/**
 * Hub calls a tool on a plugin.
 *
 * Returns a `ToolResult` with `{ ok, content?, data? }`.
 * Handler exceptions are caught and returned as `{ ok: false, error }`.
 *
 * @throws {BrikaError} code `NOT_FOUND` if the tool is not registered (future).
 */
export const callTool = rpc(
  'callTool',
  z.object({
    tool: z.string(),
    args: JsonRecord,
    ctx: ToolCallContext,
  }),
  ToolResult
);

/**
 * A block (running in a plugin) asks the hub to invoke a tool by id. The hub
 * resolves the owning plugin via the global registry and dispatches `callTool`
 * to it. This is the block-side leg of the round-trip (the `callTool` rpc above
 * is the hub -> owning-plugin leg).
 */
export const invokeTool = rpc(
  'invokeTool',
  z.object({
    tool: z.string(),
    args: JsonRecord,
  }),
  ToolResult
);

/** A block enumerates the globally-registered tools (to give them to a model). */
export const listTools = rpc(
  'listTools',
  z.object({}),
  z.object({ tools: z.array(ToolDefinition) })
);
