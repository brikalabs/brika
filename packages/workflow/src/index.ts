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
  BlockContext,
  BlockHandlers,
  // Workflow types (TOML structure)
  BlockInstance,
  BlockRuntimeInstance,
  BlockState,
  BlockTypeDefinition,
  CompiledBlock,
  // Port types
  PortDefinition,
  PortDirection,
  PortRef,
  Position,
  Workflow,
  WorkspaceMeta,
} from './types';

export { createPortRef, parsePortRef } from './types/ports';

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

export type { Serializable, ToolRef, Transformer } from './serialization';
export {
  assertSerializable,
  BlobTransformer,
  BufferTransformer,
  defaultRegistry,
  deserialize,
  deserializeSync,
  isSerializable,
  isToolRef,
  registerTransformer,
  SerializableSchema,
  serialize,
  serializeSync,
  ToolRefSchema,
  ToolRefTransformer,
  TransformerRegistry,
  toolRef,
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
  // Workflow Runtime
  BlockRegistry,
  // Event Bus
  DispatchedEvent,
  EventHandler,
  EventObserver,
  PortBuffer,
  ToolExecutor,
  WorkflowEvent,
  WorkflowRuntimeOptions,
} from './engine';

export {
  // Event Bus
  createEventStream,
  EventBus,
  // Workflow Runtime
  WorkflowRuntime,
} from './engine';
