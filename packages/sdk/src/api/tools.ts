/**
 * Plugin Tools API
 *
 * Define a tool: a named, AI-discoverable capability addressed globally by id
 * across all plugins. Unlike a {@link defineAction} (called by a plugin's own
 * pages via its uid), a tool is registered in a hub-wide registry so an agent,
 * a voice assistant, a rule, or the API can enumerate and call it by id alone.
 *
 * @example
 * ```ts
 * import { defineTool, z } from '@brika/sdk';
 *
 * defineTool(
 *   {
 *     id: 'living-room-light',
 *     description: 'Turn the living-room light on or off.',
 *     input: z.object({ on: z.boolean().describe('Desired state') }),
 *   },
 *   async ({ on }) => {
 *     await setLight(on);
 *     return `Light turned ${on ? 'on' : 'off'}`;
 *   },
 * );
 * ```
 *
 * The `input` zod schema is the single source of truth: the JSON Schema shown
 * to the model is derived from it, the incoming arguments are validated
 * against it, and the handler receives the PARSED, fully-typed value
 * (defaults applied). A raw `inputSchema` JSON object is still accepted for
 * schemas that zod cannot express.
 */

import type { z } from 'zod';
import { zodToJsonSchema } from '../blocks/reactive';
import { getContext } from '../context';
import { collectTool } from '../internal/collect-sink';
import type { Json } from '../types';

/** JSON Schema (object) describing a tool's arguments, shown to the model. */
export interface ToolInputSchema {
  type: 'object';
  properties?: Record<string, Json>;
  required?: string[];
}

export interface ToolDefinition {
  /** Globally-addressed tool id. */
  id: string;
  /** One-line description shown to the model. Be prescriptive about WHEN to call it. */
  description?: string;
  /** Lucide icon name. */
  icon?: string;
  /** Accent color as `#RRGGBB`. */
  color?: string;
  /** JSON Schema for the tool arguments. */
  inputSchema?: ToolInputSchema;
}

/** Who triggered the call. Mirrors the hub's `ToolCallSource`. */
export interface ToolCallContext {
  traceId: string;
  source: string;
}

export type ToolHandler = (
  args: Record<string, Json>,
  ctx: ToolCallContext
) => Json | Promise<Json>;

/** A {@link ToolDefinition} whose arguments are declared as a zod schema. */
export type TypedToolDefinition<S extends z.ZodObject<Record<string, z.ZodType>>> = Omit<
  ToolDefinition,
  'inputSchema'
> & {
  /** Argument schema: drives the model-facing JSON Schema AND runtime parsing. */
  input: S;
};

/** Shape the generated JSON into the wire `ToolInputSchema` contract. */
function toToolInputSchema(json: Record<string, Json>): ToolInputSchema {
  const schema: ToolInputSchema = { type: 'object' };
  const properties = json.properties;
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    schema.properties = properties;
  }
  const required = json.required;
  if (Array.isArray(required)) {
    schema.required = required.filter((entry): entry is string => typeof entry === 'string');
  }
  return schema;
}

/**
 * Register a tool with the hub. Returning a string emits it as the tool's
 * `content` (the text the model reads); any other JSON value is returned as
 * structured `data`.
 *
 * The `input` zod object is required and is the single source of truth: the
 * model-facing JSON Schema is derived from it, arguments are validated
 * against it before your handler runs, and the handler receives the PARSED,
 * fully-typed value with defaults applied. For a tool with no arguments,
 * pass `z.object({})`. For a JSON Schema zod cannot express, use
 * {@link defineRawTool}.
 */
export function defineTool<S extends z.ZodObject<Record<string, z.ZodType>>>(
  definition: TypedToolDefinition<S>,
  handler: (args: z.output<S>, ctx: ToolCallContext) => Json | Promise<Json>
): void {
  // Capture id + display metadata for `brika build`. No-op at plugin runtime.
  collectTool({
    id: definition.id,
    description: definition.description,
    icon: definition.icon,
    color: definition.color,
  });
  const { input, ...rest } = definition;
  const inputSchema = toToolInputSchema(zodToJsonSchema(input));
  // A field that accepts undefined (optional or defaulted) is not required
  // for the caller; blocks treat defaults differently, so recompute here.
  inputSchema.required = Object.entries(input.shape)
    .filter(([, field]) => !field.safeParse(undefined).success)
    .map(([key]) => key);
  if (inputSchema.required.length === 0) {
    inputSchema.required = undefined;
  }
  const wireDefinition: ToolDefinition = {
    ...rest,
    inputSchema,
  };
  const wrapped: ToolHandler = (args, ctx) => {
    const parsed = input.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for "${definition.id}": ${parsed.error.message}`);
    }
    return handler(parsed.data, ctx);
  };
  getContext().registerTool(wireDefinition, wrapped);
}

/**
 * Escape hatch: register a tool with a hand-written JSON `inputSchema` and an
 * unvalidated handler. Prefer {@link defineTool}; this exists for schemas zod
 * cannot express.
 */
export function defineRawTool(definition: ToolDefinition, handler: ToolHandler): void {
  collectTool({
    id: definition.id,
    description: definition.description,
    icon: definition.icon,
    color: definition.color,
  });
  getContext().registerTool(definition, handler);
}
