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
 * import { defineTool } from '@brika/sdk';
 *
 * defineTool(
 *   {
 *     id: 'living-room-light',
 *     description: 'Turn the living-room light on or off.',
 *     inputSchema: {
 *       type: 'object',
 *       properties: { on: { type: 'boolean' } },
 *       required: ['on'],
 *     },
 *   },
 *   async (args) => {
 *     await setLight(Boolean(args.on));
 *     return `Light turned ${args.on ? 'on' : 'off'}`;
 *   },
 * );
 * ```
 */

import { getContext } from '../context';
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

/**
 * Register a tool with the hub. Returning a string emits it as the tool's
 * `content` (the text the model reads); any other JSON value is returned as
 * structured `data`.
 */
export function defineTool(definition: ToolDefinition, handler: ToolHandler): void {
  getContext().registerTool(definition, handler);
}
