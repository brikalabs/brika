/**
 * Bricks Contract
 *
 * Brick type registration, instance lifecycle, and action dispatch.
 *
 * Plugins register brick **types**. The hub manages brick **instances** —
 * mounting/unmounting them as boards are loaded.
 */

import { z } from 'zod';
import { message } from '../define';
import { Json } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const BrickFamilySchema = z.literal([
  'sm',
  'md',
  'lg',
]);

export const BrickTypeDefinition = z.object({
  /** Local brick type ID (without plugin prefix) */
  id: z.string(),
  /** Supported size families (metadata for catalog display) */
  families: z.array(BrickFamilySchema),
  /** Minimum grid size */
  minSize: z
    .object({
      w: z.number(),
      h: z.number(),
    })
    .optional(),
  /** Maximum grid size */
  maxSize: z
    .object({
      w: z.number(),
      h: z.number(),
    })
    .optional(),
  /** Per-instance configuration schema (PreferenceDefinition[]) */
  config: z.array(z.unknown()).optional(),
});
export type BrickTypeDefinition = z.infer<typeof BrickTypeDefinition>;

// ─────────────────────────────────────────────────────────────────────────────
// Plugin → Hub
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers a brick type with the hub */
export const registerBrickType = message(
  'registerBrickType',
  z.object({
    brickType: BrickTypeDefinition,
  })
);

/** Plugin sends incremental mutations to an instance's body */
export const patchBrickInstance = message(
  'patchBrickInstance',
  z.object({
    /** Instance ID assigned by the hub */
    instanceId: z.string(),
    /** Reconciler mutations (create/update/remove) */
    mutations: z.array(z.unknown()),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Hub → Plugin
// ─────────────────────────────────────────────────────────────────────────────

/** Hub tells plugin to render a new instance of a brick type */
export const mountBrickInstance = message(
  'mountBrickInstance',
  z.object({
    instanceId: z.string(),
    brickTypeId: z.string(),
    w: z.number(),
    h: z.number(),
    config: z.record(z.string(), z.unknown()),
  })
);

/** Hub tells plugin to resize an existing instance (no remount) */
export const resizeBrickInstance = message(
  'resizeBrickInstance',
  z.object({
    instanceId: z.string(),
    w: z.number(),
    h: z.number(),
  })
);

/** Hub pushes updated config to a running instance (no remount) */
export const updateBrickConfig = message(
  'updateBrickConfig',
  z.object({
    instanceId: z.string(),
    config: z.record(z.string(), z.unknown()),
  })
);

/** Hub tells plugin to stop rendering an instance */
export const unmountBrickInstance = message(
  'unmountBrickInstance',
  z.object({
    instanceId: z.string(),
  })
);

/** Hub sends a user interaction event to a specific instance */
export const brickInstanceAction = message(
  'brickInstanceAction',
  z.object({
    instanceId: z.string(),
    brickTypeId: z.string(),
    actionId: z.string(),
    payload: Json.optional(),
  })
);
