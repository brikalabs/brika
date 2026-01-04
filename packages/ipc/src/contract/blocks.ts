/**
 * Blocks Contract
 *
 * Block registration and execution
 */

import { z } from 'zod';
import { message, rpc } from '../define';
import { Json, JsonRecord } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const BlockCategory = z.string();
export type BlockCategory = z.infer<typeof BlockCategory>;

export const BlockPort = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type BlockPort = z.infer<typeof BlockPort>;

export const BlockDefinition = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: BlockCategory,
  icon: z.string().optional(),
  color: z.string().optional(),
  inputs: z.array(BlockPort),
  outputs: z.array(BlockPort),
  schema: JsonRecord.optional(),
});
export type BlockDefinition = z.infer<typeof BlockDefinition>;

export const BlockContext = z.object({
  workflowId: z.string(),
  executionId: z.string(),
  nodeId: z.string(),
  trigger: Json,
  vars: JsonRecord,
});
export type BlockContext = z.infer<typeof BlockContext>;

export const BlockResult = z.object({
  output: z.string().optional(),
  data: Json.optional(),
  setVars: JsonRecord.optional(),
  error: z.string().optional(),
  stop: z.boolean().optional(),
});
export type BlockResult = z.infer<typeof BlockResult>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers a block with the hub */
export const registerBlock = message(
  'registerBlock',
  z.object({
    block: BlockDefinition,
  })
);

/** Hub executes a block on a plugin */
export const executeBlock = rpc(
  'executeBlock',
  z.object({
    blockType: z.string(),
    config: JsonRecord,
    context: BlockContext,
  }),
  BlockResult
);
