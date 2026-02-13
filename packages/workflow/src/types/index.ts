/**
 * Workflow Types
 *
 * Core type definitions for the event-driven workflow system.
 */

// Block types
export type {
  BlockInstance,
  BlockRuntimeContext,
  BlockRuntimeState,
  BlockState,
  BlockTypeDefinition,
  CompiledBlock,
} from './blocks';

// Port types
export type { PortDefinition, PortDirection, PortRef } from './ports';
export { createPortRef, parsePortRef } from './ports';

// Workflow types (YAML structure)
export type {
  BlockConfig,
  Position,
  Workflow,
  WorkspaceMeta,
} from './workflow';
