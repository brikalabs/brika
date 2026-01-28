/**
 * @brika/workflow
 *
 * Event-driven workflow engine.
 * Blocks are reactive flow handlers - no persistence, just live data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Block types
  BlockCategory,
  BlockConfig,
  BlockInstance,
  BlockRuntimeContext,
  BlockRuntimeState,
  BlockState,
  BlockTypeDefinition,
  CompiledBlock,
  // Port types
  PortDefinition,
  PortDirection,
  PortRef,
  Position,
  // Workflow types
  Workflow,
  WorkspaceMeta,
} from './types';

export { createPortRef, parsePortRef } from './types/ports';

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

export type { Serializable, Transformer } from './serialization';
export {
  assertSerializable,
  BlobTransformer,
  BufferTransformer,
  defaultRegistry,
  deserialize,
  deserializeSync,
  isSerializable,
  registerTransformer,
  SerializableSchema,
  serialize,
  serializeSync,
  Uint8ArrayTransformer,
} from './serialization';

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ConnectionCheck,
  ConnectionResult,
  ValidationError,
  ValidationResult,
} from './validation';
export {
  getSchemaTypeName,
  isSchemaCompatible,
  isValidConnection,
  validatePortData,
  validateWorkspace,
} from './validation';

// ─────────────────────────────────────────────────────────────────────────────
// Workspace
// ─────────────────────────────────────────────────────────────────────────────

export type { ParseResult, RawWorkspace } from './workspace';
export { parseWorkspace, WorkspaceLoader, WorkspaceSchema } from './workspace';

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

export type {
  BlockRegistry,
  DispatchedEvent,
  EventHandler,
  EventObserver,
  PortBuffer,
  ToolExecutor,
  WorkflowEvent,
  WorkflowRuntimeOptions,
} from './engine';

export { createEventStream, EventBus, WorkflowRuntime } from './engine';
