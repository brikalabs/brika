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
  /** Structural type descriptor (JSON-serialized TypeDescriptor from @brika/type-system) */
  type: Json.optional(),
  /**
   * When set, this port is a template that the editor repeats once per item of
   * the named config array (e.g. `cases`), producing ports `<id>-<index>`.
   */
  dynamic: z.string().optional(),
});
export type BlockPort = z.infer<typeof BlockPort>;

/**
 * Host-scheduled trigger declaration. A discriminated union on `kind` so new
 * schedule kinds (cron, webhook, ...) are added as additional members without
 * breaking older peers: an unknown `kind` simply fails this optional field's
 * parse and the block degrades to a normal (non-hosted) block.
 *
 * Wire mirror of `@brika/sdk`'s `BlockTrigger` type; adding a `kind` means
 * updating both, plus the prelude's `BlockTriggerSpec` and the executor switch.
 */
export const BlockTrigger = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('interval'),
    intervalField: z.string(),
    output: z.string(),
  }),
]);
export type BlockTrigger = z.infer<typeof BlockTrigger>;

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
  /**
   * Present when the block is a host-scheduled trigger; absent otherwise.
   * `.catch(undefined)` is load-bearing for forward-compat: a future trigger
   * `kind` this peer doesn't know fails the union, and without the catch that
   * would fail the WHOLE block parse and drop the block from the registry. With
   * it, only the trigger degrades to undefined, so the block still registers and
   * runs via its in-plugin fallback.
   */
  trigger: BlockTrigger.optional().catch(undefined),
});
export type BlockDefinition = z.infer<typeof BlockDefinition>;

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

// ─────────────────────────────────────────────────────────────────────────────
// Reactive Block Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hub starts a block instance in the plugin (reactive).
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, error: string }` on failure.
 * The plugin handler may throw, which gets serialized as `{ ok: false, error }`.
 */
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
    /** Run correlation id of the event that caused this delivery */
    causationId: z.string().optional(),
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
    /** Run correlation id of the input that caused this emit (async-traced) */
    causationId: z.string().optional(),
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
    /** Structured payload persisted into the run trace (per-step data, cost, ...) */
    data: Json.optional(),
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
