import { type ActionsUnion, defineActions } from '@brika/events';
import { z } from 'zod';

// Plugin actions
export const PluginActions = defineActions('plugin', {
  loaded: z.object({
    uid: z.string(),
    name: z.string(),
    version: z.string(),
    pid: z.number().optional(),
  }),
  unloaded: z.object({
    uid: z.string(),
    name: z.string(),
  }),
  reloaded: z.object({
    uid: z.string(),
    name: z.string(),
  }),
  configInvalid: z.object({
    uid: z.string(),
    name: z.string(),
    errors: z.array(z.string()),
  }),
  error: z.object({
    uid: z.string(),
    name: z.string(),
    error: z.string(),
  }),
});

export type PluginAction = ActionsUnion<typeof PluginActions>;

// Spark actions for typed events
export const SparkActions = defineActions('spark', {
  emit: z.object({
    /** Full spark type (pluginId:sparkId) */
    type: z.string(),
    /** Source plugin that emitted */
    source: z.string(),
    /** Validated payload */
    payload: z.unknown(),
  }),
});

export type SparkAction = ActionsUnion<typeof SparkActions>;

// Brick actions for board bricks
export const BrickActions = defineActions('brick', {
  typeRegistered: z.object({
    pluginName: z.string(),
    brickTypeId: z.string(),
    descriptor: z.unknown(),
  }),
  typeUnregistered: z.object({
    brickTypeId: z.string(),
  }),
  instanceMounted: z.object({
    instanceId: z.string(),
    brickTypeId: z.string(),
  }),
  instancePatched: z.object({
    instanceId: z.string(),
    mutations: z.array(z.unknown()),
  }),
  instanceUnmounted: z.object({
    instanceId: z.string(),
  }),
  pluginDisconnected: z.object({
    pluginName: z.string(),
    instanceIds: z.array(z.string()),
  }),
});

export type BrickAction = ActionsUnion<typeof BrickActions>;

// Board actions for layout management
export const BoardActions = defineActions('board', {
  created: z.object({
    boardId: z.string(),
  }),
  deleted: z.object({
    boardId: z.string(),
  }),
  brickAdded: z.object({
    boardId: z.string(),
    instanceId: z.string(),
    placement: z.unknown(),
  }),
  brickRemoved: z.object({
    boardId: z.string(),
    instanceId: z.string(),
  }),
  layoutChanged: z.object({
    boardId: z.string(),
    layouts: z.array(
      z.object({
        instanceId: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      })
    ),
  }),
  brickLabelChanged: z.object({
    boardId: z.string(),
    instanceId: z.string(),
    label: z.string().optional(),
  }),
  brickConfigChanged: z.object({
    boardId: z.string(),
    instanceId: z.string(),
    config: z.record(z.string(), z.unknown()),
  }),
});

export type BoardAction = ActionsUnion<typeof BoardActions>;
