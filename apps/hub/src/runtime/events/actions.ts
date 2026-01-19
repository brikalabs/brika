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
