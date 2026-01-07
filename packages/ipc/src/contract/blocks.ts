/**
 * Blocks Contract
 *
 * Block registration and reactive execution
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

/** Hub executes a block on a plugin (legacy one-shot) */
export const executeBlock = rpc(
  'executeBlock',
  z.object({
    blockType: z.string(),
    config: JsonRecord,
    context: BlockContext,
  }),
  BlockResult
);

// ─────────────────────────────────────────────────────────────────────────────
// Reactive Block Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/** Hub starts a block instance in the plugin (reactive) */
export const startBlock = rpc(
  'startBlock',
  z.object({
    /** Full block type (pluginId:blockId) */
    blockType: z.string(),
    /** Unique instance ID for this block */
    instanceId: z.string(),
    /** Workflow ID */
    workflowId: z.string(),
    /** Block configuration */
    config: JsonRecord,
  }),
  z.object({
    ok: z.boolean(),
    error: z.string().optional(),
  })
);

/** Hub pushes data to a block's input port */
export const pushInput = message(
  'pushInput',
  z.object({
    /** Block instance ID */
    instanceId: z.string(),
    /** Input port ID */
    port: z.string(),
    /** Data to push */
    data: Json,
  })
);

/** Plugin emits data from a block's output port */
export const blockEmit = message(
  'blockEmit',
  z.object({
    /** Block instance ID */
    instanceId: z.string(),
    /** Output port ID */
    port: z.string(),
    /** Emitted data */
    data: Json,
  })
);

/** Plugin emits a log message from a block */
export const blockLog = message(
  'blockLog',
  z.object({
    /** Block instance ID */
    instanceId: z.string(),
    /** Workflow ID */
    workflowId: z.string(),
    /** Log level */
    level: z.enum(['debug', 'info', 'warn', 'error']),
    /** Log message */
    message: z.string(),
  })
);

/** Hub stops a block instance */
export const stopBlock = message(
  'stopBlock',
  z.object({
    /** Block instance ID */
    instanceId: z.string(),
  })
);
