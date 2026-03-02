/**
 * Bricks Contract
 *
 * Brick type registration, data push, config updates, and action dispatch.
 *
 * All bricks are client-rendered. Plugins register brick **types** and push
 * data; the hub manages brick **instances** on boards.
 */

import { z } from 'zod';
import { message } from '../define';
import { Json } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const BrickFamilySchema = z.literal(['sm', 'md', 'lg']);

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

/** Plugin pushes arbitrary data for a brick type (client-rendered bricks) */
export const pushBrickData = message(
  'pushBrickData',
  z.object({
    brickTypeId: z.string(),
    data: z.unknown(),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Hub → Plugin
// ─────────────────────────────────────────────────────────────────────────────

/** Hub pushes updated config to a running instance */
export const updateBrickConfig = message(
  'updateBrickConfig',
  z.object({
    instanceId: z.string(),
    config: z.record(z.string(), z.unknown()),
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
