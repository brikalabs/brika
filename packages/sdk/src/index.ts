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
export type { ResolvedRef, TypeMarkerValue } from './blocks/schema-types';
export { getTypeMarker, parseResolvedMarker, TypeMarker } from './blocks/schema-types';

// ─────────────────────────────────────────────────────────────────────────────
// Block Metadata Types
// ─────────────────────────────────────────────────────────────────────────────

export type { BlockDefinition, BlockPort, BlockSchema, PortDirection } from './blocks';

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

export type { Logger } from './api/logging';
export { log } from './api/logging';

// ─────────────────────────────────────────────────────────────────────────────
// Sparks (Typed Events)
// ─────────────────────────────────────────────────────────────────────────────

export type { CompiledSpark } from './api/sparks';
export { defineSpark, subscribeSpark } from './api/sparks';

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export type { InitHandler, StopHandler, UninstallHandler } from './api/lifecycle';
export { onInit, onStop, onUninstall } from './api/lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

export type { PreferencesChangeHandler } from './api/preferences';
export {
  definePreferenceOptions,
  getPreferences,
  onPreferencesChange,
  setPreference,
} from './api/preferences';

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

export type { RouteHandler, RouteMethod, RouteRequest, RouteResponse } from './api/routes';
export { defineRoute } from './api/routes';

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

export type { ActionRef } from './api/actions';
export { defineAction } from './api/actions';

// ─────────────────────────────────────────────────────────────────────────────
// OAuth
// ─────────────────────────────────────────────────────────────────────────────

export type { OAuthClient, OAuthProviderConfig, OAuthToken } from './api/oauth';
export { defineOAuth } from './api/oauth';

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

export type { Store } from './api/storage';
export {
  clearAllData,
  defineStore,
  deleteJSON,
  exists,
  getDataDir,
  readJSON,
  updateJSON,
  writeJSON,
} from './api/storage';

// ─────────────────────────────────────────────────────────────────────────────
// Common Types
// ─────────────────────────────────────────────────────────────────────────────

export * from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Location
// ─────────────────────────────────────────────────────────────────────────────

export type { DeviceLocation } from './api/location';
export type { HubLocationData } from './context/location';
export { getDeviceLocation } from './api/location';

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export {
  PermissionDeniedError,
  NotFoundError,
  InvalidInputError,
  InternalError,
  rethrowRpcError,
  sdkErrors,
} from './errors';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export { Json, JsonRecord } from '@brika/ipc';
export type { PluginInfo, ToolCallContext, ToolResult } from '@brika/ipc/contract';
