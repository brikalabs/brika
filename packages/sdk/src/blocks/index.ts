/**
 * Block System Exports
 *
 * Reactive event-driven block API.
 */

// Re-export from @brika/flow
export * from '@brika/flow';
// Re-export Zod
export { z } from 'zod';

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

export { createEmitter, createFlowFromInput, input, output, zodToJsonSchema } from './reactive';

// Compiled reactive block
export type { BlockInstance, BlockRuntimeContext, CompiledReactiveBlock } from './reactive-define';
export { defineReactiveBlock, isCompiledReactiveBlock } from './reactive-define';
// Block metadata types
export type { BlockDefinition, BlockPort, BlockSchema, PortDirection, Serializable } from './types';
