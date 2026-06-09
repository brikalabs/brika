import { defineActions } from '@brika/events';
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
  rssSoftLimitBreached: z.object({
    uid: z.string(),
    name: z.string(),
    /** Resident set size (bytes) at the moment the breach was confirmed. */
    rssBytes: z.number(),
    /** Configured soft-limit (bytes) that was exceeded. */
    limitBytes: z.number(),
  }),
  /**
   * Build progress for a plugin's source, emitted while installing/enabling so
   * the UI can show compilation live over the existing `/api/stream/events` SSE.
   * `start` opens a run, one `progress` fires per build step (each client module
   * kind plus the server entry), and `done`/`error` close it.
   */
  compile: z.object({
    uid: z.string(),
    name: z.string(),
    phase: z.enum(['start', 'progress', 'done', 'error']),
    /** Build step a `progress` event reports: a module kind or `'server'`. */
    step: z.string().optional(),
    /** Modules compiled in this step. */
    modules: z.number().optional(),
    /** Shared chunks emitted in this step. */
    chunks: z.number().optional(),
    /** True when the step was served from cache rather than rebuilt. */
    cached: z.boolean().optional(),
    /** Wall-clock duration of the step (`progress`) or whole run (`done`). */
    durationMs: z.number().optional(),
    /** Human-readable detail, set on `error` (the failure message). */
    message: z.string().optional(),
  }),
});

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
  dataUpdated: z.object({
    brickTypeId: z.string(),
    data: z.unknown(),
  }),
  moduleRecompiled: z.object({
    pluginName: z.string(),
    brickTypeId: z.string(),
    moduleUrl: z.string(),
  }),
});

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

// Update actions for hub version updates
export const UpdateActions = defineActions('update', {
  available: z.object({
    currentVersion: z.string(),
    latestVersion: z.string(),
    releaseCommit: z.string(),
  }),
});

// Theme actions — fan-out signal so other tabs/devices refetch theme state
export const ThemeActions = defineActions('theme', {
  /** Custom theme list changed (added, updated, or removed). */
  customThemesChanged: z.object({}),
  /** Active theme or color mode preference changed. */
  activeChanged: z.object({
    theme: z.string().nullable(),
    mode: z.enum(['light', 'dark', 'system']),
  }),
});
