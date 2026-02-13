/**
 * Block Types
 *
 * Event-driven block type definitions for the workflow engine.
 */

import type { z } from 'zod';
import type { Serializable } from '../serialization';
import type { PortDefinition } from './ports';

// ─────────────────────────────────────────────────────────────────────────────
// Block Category
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Block State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block runtime state.
 *
 * - `running`: Block is active and processing events
 * - `paused`: Block is suspended (events are buffered)
 * - `stopped`: Block is fully stopped
 */
export type BlockState = 'running' | 'paused' | 'stopped';

// ─────────────────────────────────────────────────────────────────────────────
// Block Type Definition (Metadata)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block type definition - metadata only.
 */
export interface BlockTypeDefinition {
  /** Local block ID (without plugin prefix) */
  id: string;

  /** i18n key for display name */
  nameKey: string;

  /** i18n key for description */
  descriptionKey: string;

  /** Category for UI grouping */
  category: string;

  /** Lucide icon name */
  icon: string;

  /** Hex color */
  color: string;

  /** Input port definitions (empty = source block) */
  inputs: PortDefinition[];

  /** Output port definitions (empty = sink block) */
  outputs: PortDefinition[];

  /** Zod schema for block configuration */
  configSchema: z.ZodObject<z.ZodRawShape>;

  /** Plugin that provides this block */
  pluginId?: string;

  /** Full qualified type "pluginId:blockId" */
  type?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compiled Block (with start function)
// ─────────────────────────────────────────────────────────────────────────────

/** Runtime context for starting a block */
export interface BlockRuntimeContext {
  blockId: string;
  workflowId: string;
  config: Record<string, unknown>;
  emit(portId: string, data: Serializable): void;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
  callTool(toolId: string, args: Record<string, Serializable>): Promise<Serializable>;
}

/** Running block instance */
export interface BlockInstance {
  /** Push data to an input port */
  pushInput(portId: string, data: Serializable): void;
  /** Stop the block and clean up */
  stop(): void;
}

/**
 * A compiled block ready for use in workflows.
 * Created by defineReactiveBlock in the SDK.
 */
export interface CompiledBlock extends BlockTypeDefinition {
  /** Start the block - creates reactive context and runs setup */
  start(ctx: BlockRuntimeContext): BlockInstance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Runtime Instance (Workflow Engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime instance of a block in a workflow.
 * Managed by WorkflowRuntime.
 */
export interface BlockRuntimeState {
  /** Unique instance ID */
  id: string;

  /** Block type */
  type: string;

  /** Configuration */
  config: Record<string, unknown>;

  /** Current state */
  state: BlockState;

  /** The running block instance (null when stopped) */
  instance: BlockInstance | null;

  /** Buffered events (when paused) */
  buffer: Array<{ portId: string; data: Serializable }>;
}
