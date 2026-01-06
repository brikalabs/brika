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
// Block Metadata Types
// ─────────────────────────────────────────────────────────────────────────────

export type { BlockDefinition, BlockPort, BlockSchema, PortDirection } from './blocks';

// ─────────────────────────────────────────────────────────────────────────────
// Tools & Events
// ─────────────────────────────────────────────────────────────────────────────

export type { CompiledTool, EventHandler, EventPayload, StopHandler, ToolSpec } from './api';

export { defineTool, emit, log, on, onEvent, onStop, start } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Common Types
// ─────────────────────────────────────────────────────────────────────────────

export * from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export { Json, JsonRecord } from '@brika/ipc';
export type { PluginInfo, ToolCallContext, ToolResult } from '@brika/ipc/contract';

export { z } from 'zod';
