/**
 * Block System Exports
 *
 * Reactive event-driven block API.
 */

// Re-export from @brika/flow
export * from '@brika/flow';
// Reactive block API
export type {
  BlockContext,
  BlockSetup,
  InputDef,
  InputFlows,
  OutputDef,
  OutputEmitters,
  PortMeta,
  ReactiveBlockSpec,
} from './reactive';
export {
  createEmitter,
  createFlowFromInput,
  input,
  output,
  zodToJsonSchema,
  zodToTypeName,
} from './reactive';
// Compiled reactive block
export type { BlockInstance, BlockRuntimeContext, CompiledReactiveBlock } from './reactive-define';
export { defineReactiveBlock, isCompiledReactiveBlock } from './reactive-define';
export type { ZodInfer, ZodObject, ZodRawShape, ZodType } from './schema';
// Custom schema module (safe subset of Zod + BRIKA types)
// ❌ Use this instead of importing 'zod' directly
export { z } from './schema';
// Type markers
// Schema type markers and utilities (for internal use)
export type { GenericRef, PassthroughRef, TypeMarkerValue } from './schema-types';
export {
  getTypeMarker,
  isGenericRef,
  isPassthrough,
  isPassthroughRef,
  TypeMarker,
} from './schema-types';
// Block metadata types
export type { BlockDefinition, BlockPort, BlockSchema, PortDirection, Serializable } from './types';
