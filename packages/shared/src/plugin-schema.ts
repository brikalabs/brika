/**
 * BRIKA Plugin Schema
 *
 * Zod schema for validating plugin package.json files.
 * Used by the plugin manager to validate plugins at load time.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Tool Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ToolManifestSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Block Schema
// ─────────────────────────────────────────────────────────────────────────────

export const BlockManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(['trigger', 'flow', 'action', 'transform']).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Manifest Schema
// ─────────────────────────────────────────────────────────────────────────────

export const PluginManifestSchema = z.looseObject({
  // Required
  name: z.string().min(1),
  version: z.string(),

  // Metadata
  description: z.string().optional(),
  author: z
    .union([
      z.string(),
      z.object({ name: z.string(), email: z.string().optional(), url: z.string().optional() }),
    ])
    .optional(),
  homepage: z.string().optional().nullable(),
  repository: z
    .union([
      z.string(),
      z.object({ type: z.string().optional(), url: z.string(), directory: z.string().optional() }),
    ])
    .optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),

  // Compatibility (required)
  engines: z.object({
    brika: z.string(),
  }),

  // Plugin-specific
  icon: z.string().optional(),
  tools: z.array(ToolManifestSchema).optional(),
  blocks: z.array(BlockManifestSchema).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
