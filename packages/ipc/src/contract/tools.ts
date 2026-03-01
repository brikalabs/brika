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

export const ToolInputSchemaProperty = z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string().optional(),
  default: Json.optional(),
  enum: z.array(Json).optional(),
  items: z
    .object({
      type: z.string(),
    })
    .optional(),
  required: z.boolean().optional(),
});
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
 * @throws {RpcError} code `NOT_FOUND` if the tool is not registered (future).
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
