/**
 * ELIA SDK
 *
 * Functional API for building home automation plugins.
 *
 * @example
 * ```typescript
 * import { defineTool, log, emit, onStop, z } from "@brika/sdk";
 *
 * export const myTool = defineTool({
 *   id: "my-tool",
 *   schema: z.object({ name: z.string() }),
 * }, async (args) => {
 *   log("info", `Hello ${args.name}`);
 *   return { ok: true };
 * });
 *
 * onStop(() => log("info", "Cleaning up..."));
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Functional API
// ─────────────────────────────────────────────────────────────────────────────

export {
  type BlockSpec,
  type CompiledBlockRef,
  type CompiledTool,
  defineBlock,
  // Tool & Block definitions
  defineTool,
  type EventHandler,
  type EventPayload,
  // Events
  emit,
  // Logging
  log,
  on,
  onEvent,
  // Lifecycle
  onStop,
  type StopHandler,
  start,
  // Types
  type ToolSpec,
} from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export * from './blocks';
export * from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

// Re-export commonly used IPC types for convenience
export { Json, JsonRecord } from '@brika/ipc';
export type {
  BlockContext as IpcBlockContext,
  BlockResult as IpcBlockResult,
  PluginInfo,
  ToolCallContext,
  ToolResult,
} from '@brika/ipc/contract';
// Re-export Zod for convenience
export { z } from 'zod';
// Re-export block utilities
export { expr, parseDuration } from './blocks/define';
