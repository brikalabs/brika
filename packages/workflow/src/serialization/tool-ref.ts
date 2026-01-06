/**
 * Tool Reference
 *
 * Branded string type for referencing tools in block configurations.
 */

import type { Transformer } from '@brika/serializable';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// ToolRef Type
// ─────────────────────────────────────────────────────────────────────────────

/** Symbol used to brand ToolRef objects */
const TOOL_REF_BRAND = Symbol.for('brika.toolRef');

/**
 * ToolRef is a branded object that holds a tool ID.
 * Format: "pluginId:toolId" (e.g., "@brika/plugin-hue:set-light")
 */
export interface ToolRef {
  readonly [TOOL_REF_BRAND]: true;
  readonly id: string;
}

/**
 * Create a ToolRef from a tool ID string.
 *
 * @param id - Full tool ID (e.g., "@brika/plugin-hue:set-light")
 * @returns ToolRef object
 *
 * @example
 * const ref = toolRef("@brika/plugin-hue:set-light");
 */
export function toolRef(id: string): ToolRef {
  // Validate format: must contain ":"
  if (!id.includes(':')) {
    throw new Error(`Invalid tool reference: "${id}" - must be "pluginId:toolId"`);
  }
  return {
    [TOOL_REF_BRAND]: true,
    id,
  };
}

/**
 * Check if a value is a ToolRef.
 */
export function isToolRef(value: unknown): value is ToolRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    TOOL_REF_BRAND in value &&
    (value as ToolRef)[TOOL_REF_BRAND] === true
  );
}

/**
 * Get the ID string from a ToolRef.
 */
export function getToolId(ref: ToolRef): string {
  return ref.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformer
// ─────────────────────────────────────────────────────────────────────────────

/** ToolRef transformer for serialization */
export const ToolRefTransformer: Transformer<ToolRef, string> = {
  name: 'ToolRef',
  isApplicable: isToolRef,
  serialize: (v) => v.id,
  deserialize: (id) => toolRef(id),
};

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for ToolRef validation.
 * Use in block configSchema for tool reference fields.
 *
 * @example
 * configSchema: z.object({
 *   tool: ToolRefSchema,
 *   args: z.record(z.unknown()),
 * })
 */
export const ToolRefSchema = z
  .string()
  .refine((s) => s.includes(':'), {
    message: 'Tool reference must be "pluginId:toolId"',
  })
  .transform((s) => toolRef(s))
  .describe('tool:reference'); // Marker for UI to render tool picker
