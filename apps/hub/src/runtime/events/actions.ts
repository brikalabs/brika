import { type ActionsUnion, defineActions } from '@elia/events';
import { z } from 'zod';

// Plugin actions
export const PluginActions = defineActions('plugin', {
  loaded: z.object({
    uid: z.string(),
    name: z.string(),
    version: z.string(),
    pid: z.number().optional(),
    ref: z.string(),
  }),
  unloaded: z.object({
    uid: z.string(),
    name: z.string(),
    ref: z.string(),
  }),
  reloaded: z.object({
    uid: z.string(),
    name: z.string(),
    ref: z.string(),
  }),
  error: z.object({
    uid: z.string(),
    name: z.string(),
    error: z.string(),
  }),
});

export type PluginAction = ActionsUnion<typeof PluginActions>;

// Generic event actions for untyped events
export const GenericEventActions = defineActions('event', {
  emit: z.object({
    type: z.string(),
    source: z.string(),
    payload: z.unknown(),
  }),
});

export type GenericEventAction = ActionsUnion<typeof GenericEventActions>;
