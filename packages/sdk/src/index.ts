/**
 * ELIA SDK
 *
 * Functional API for building home automation plugins.
 *
 * @example
 * ```typescript
 * import { defineTool, log, emit, onStop, z } from "@elia/sdk";
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
  // Tool & Block definitions
  defineTool,
  defineBlock,
  // Logging
  log,
  // Events
  emit,
  on,
  onEvent,
  // Lifecycle
  onStop,
  start,
  // Types
  type ToolSpec,
  type CompiledTool,
  type BlockSpec,
  type CompiledBlockRef,
  type EventPayload,
  type EventHandler,
  type StopHandler,
} from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export * from "./types";
export * from "./blocks";

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

// Re-export Zod for convenience
export { z } from "zod";

// Re-export block utilities
export { expr, parseDuration } from "./blocks/define";

// Re-export commonly used IPC types for convenience
export { Json, JsonRecord } from "@elia/ipc";
export type {
  ToolResult,
  ToolCallContext,
  BlockContext as IpcBlockContext,
  BlockResult as IpcBlockResult,
  PluginInfo,
} from "@elia/ipc/contract";
