/**
 * Workflow Types
 *
 * Core type definitions for the event-driven workflow system.
 */

// Block types (event-driven)
export type {
  BlockCategory,
  BlockContext,
  BlockHandlers,
  BlockRuntimeInstance,
  BlockState,
  BlockTypeDefinition,
  CompiledBlock,
} from './blocks';

// Port types
export type { PortDefinition, PortDirection, PortRef } from './ports';
export { createPortRef, parsePortRef } from './ports';

// Workflow types (TOML structure)
export type { BlockInstance, Position, Workflow, WorkspaceMeta } from './workflow';
