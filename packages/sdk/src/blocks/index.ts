/**
 * Block System Exports
 */

// Reactive API - re-export from @brika/flow
export * from '@brika/flow';
// Low-Level API (imperative handlers)
export type { BlockSpec } from './define';
export { defineBlock, expr, isCompiledBlock, parseDuration, z } from './define';
// Reactive API - SDK-specific
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
export { defineReactiveBlock } from './reactive-define';
export type {
  BlockDefinition,
  BlockHandlers,
  BlockPort,
  BlockSchema,
  CompiledBlock,
  LowLevelBlockContext,
  PortDirection,
  Serializable,
  SimplePort,
  StateStore,
} from './types';
