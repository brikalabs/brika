/**
 * BRIKA SDK
 *
 * Reactive, type-safe API for building home automation blocks and tools.
 *
 * @example Reactive Block
 * ```typescript
 * import { defineReactiveBlock, input, output, combine, map, z } from "@brika/sdk";
 *
 * export const sensorBlock = defineReactiveBlock({
 *   id: "sensor-processor",
 *   inputs: {
 *     temperature: input(z.number(), { name: "Temperature" }),
 *     humidity: input(z.number(), { name: "Humidity" }),
 *   },
 *   outputs: {
 *     comfort: output(z.object({ score: z.number() }), { name: "Comfort" }),
 *   },
 *   config: z.object({ threshold: z.number() }),
 * }, ({ inputs, outputs, config }) => {
 *   combine(inputs.temperature, inputs.humidity)
 *     .pipe(map(([t, h]) => ({ score: (t + h) / 2 })))
 *     .to(outputs.comfort);
 * });
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Reactive Flow API (from @brika/flow)
// ─────────────────────────────────────────────────────────────────────────────

export * from '@brika/flow';

// ─────────────────────────────────────────────────────────────────────────────
// Serializable (from @brika/serializable)
// ─────────────────────────────────────────────────────────────────────────────

export type { Serializable } from '@brika/serializable';

// ─────────────────────────────────────────────────────────────────────────────
// Reactive Block API
// ─────────────────────────────────────────────────────────────────────────────

export type {
  BlockContext,
  BlockInstance,
  BlockRuntimeContext,
  BlockSetup,
  CompiledReactiveBlock,
  InputDef,
  InputFlows,
  OutputDef,
  OutputEmitters,
  PortMeta,
  ReactiveBlockSpec,
} from './blocks';

export {
  createEmitter,
  createFlowFromInput,
  defineReactiveBlock,
  input,
  isCompiledReactiveBlock,
  output,
  zodToJsonSchema,
} from './blocks';

// ─────────────────────────────────────────────────────────────────────────────
// Custom Schema Module (z with safe types + BRIKA custom types)
// ─────────────────────────────────────────────────────────────────────────────

export type { ZodInfer, ZodObject, ZodRawShape, ZodType } from './blocks/schema';
// Use this instead of importing 'zod' directly!
// Includes: z.generic(), z.passthrough(), z.expression(), z.color(), etc.
// Does NOT include: z.unknown(), z.any() - use z.generic() instead
export { z } from './blocks/schema';

// Type markers and utilities (for internal use)
export type { TypeMarkerValue } from './blocks/schema-types';
export { getTypeMarker, isPassthrough, TypeMarker } from './blocks/schema-types';

// ─────────────────────────────────────────────────────────────────────────────
// Block Metadata Types
// ─────────────────────────────────────────────────────────────────────────────

export type { BlockDefinition, BlockPort, BlockSchema, PortDirection } from './blocks';

// ─────────────────────────────────────────────────────────────────────────────
// Events & Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export type {
  EventHandler,
  EventPayload,
  InitHandler,
  PreferencesChangeHandler,
  StopHandler,
  UninstallHandler,
} from './api';

export {
  emit,
  getPreferences,
  log,
  on,
  onEvent,
  onInit,
  onPreferencesChange,
  onStop,
  onUninstall,
} from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Common Types
// ─────────────────────────────────────────────────────────────────────────────

export * from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export { Json, JsonRecord } from '@brika/ipc';
export type { PluginInfo, ToolCallContext, ToolResult } from '@brika/ipc/contract';
