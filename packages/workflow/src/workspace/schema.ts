/**
 * Workspace Schema
 *
 * Zod schema for validating TOML workspace files.
 */

import { z } from 'zod';
import type { PortRef } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Port Reference Schema
// ─────────────────────────────────────────────────────────────────────────────

const PortRefSchema = z.string().refine((s) => s.includes(':'), {
  message: 'Port reference must be "blockId:portId"',
}) as z.ZodType<PortRef>;

const PortRefsSchema = z.array(PortRefSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Position Schema
// ─────────────────────────────────────────────────────────────────────────────

const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Block Instance Schema
// ─────────────────────────────────────────────────────────────────────────────

const BlockInstanceSchema = z.object({
  id: z.string().min(1, 'Block ID is required'),
  type: z.string().min(1, 'Block type is required'),
  position: PositionSchema.optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  inputs: z.record(z.string(), PortRefsSchema).default({}),
  outputs: z.record(z.string(), PortRefsSchema).default({}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Meta Schema
// ─────────────────────────────────────────────────────────────────────────────

const WorkspaceMetaSchema = z.object({
  id: z.string().min(1, 'Workspace ID is required'),
  name: z.string().min(1, 'Workspace name is required'),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
});

// ─────────────────────────────────────────────────────────────────────────────
// Full Workspace Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete workspace schema for TOML validation.
 */
export const WorkspaceSchema = z.object({
  version: z.string().default('1'),
  workspace: WorkspaceMetaSchema,
  plugins: z.record(z.string(), z.string()).default({}),
  blocks: z.array(BlockInstanceSchema).default([]),
});

/**
 * Raw workspace type before transformation.
 */
export type RawWorkspace = z.input<typeof WorkspaceSchema>;
