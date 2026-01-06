/**
 * Block Types
 *
 * Event-driven block type definitions.
 * Blocks are flow handlers that subscribe to inputs and emit to outputs.
 */

import type { z } from 'zod';
import type { Serializable } from '../serialization';
import type { PortDefinition } from './ports';

// ─────────────────────────────────────────────────────────────────────────────
// Block Category
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block category for UI grouping.
 * Free-form string - plugins can define any category.
 *
 * @example "logic", "integrations", "smart-home", "utilities", "operators"
 */
export type BlockCategory = string;

// ─────────────────────────────────────────────────────────────────────────────
// Block State (Simple)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block runtime state.
 * Much simpler than the old execution status model.
 *
 * - `running`: Block is active and processing events
 * - `paused`: Block is suspended (events are buffered)
 * - `stopped`: Block is fully stopped
 */
export type BlockState = 'running' | 'paused' | 'stopped';

// ─────────────────────────────────────────────────────────────────────────────
// Block Context (Event-Driven)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to block handlers.
 * No persistent state - blocks are stateless flow handlers.
 */
export interface BlockContext {
  /** Block instance ID */
  blockId: string;

  /** Workflow ID this block belongs to */
  workflowId: string;

  /** Block configuration */
  config: Record<string, unknown>;

  /**
   * Emit data to an output port.
   * This sends the data to all connected blocks.
   */
  emit(portId: string, data: Serializable): void;

  /** Log a message */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;

  /** Call a registered tool */
  callTool(toolId: string, args: Record<string, Serializable>): Promise<Serializable>;

  /** Schedule a callback after delay */
  setTimeout(callback: () => void, ms: number): () => void;

  /** Schedule a repeating callback */
  setInterval(callback: () => void, ms: number): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Handlers (Event-Driven)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event-driven block handlers.
 * Blocks are flow handlers - they set up subscriptions and emit data.
 */
export interface BlockHandlers {
  /**
   * Called when the workflow starts.
   * Set up subscriptions, start timers, etc.
   */
  onStart?(ctx: BlockContext): void | Promise<void>;

  /**
   * Called when data arrives at an input port.
   */
  onInput(portId: string, data: Serializable, ctx: BlockContext): void | Promise<void>;

  /**
   * Called when the workflow stops.
   * Clean up timers, subscriptions, etc.
   */
  onStop?(ctx: BlockContext): void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Type Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block type definition provided by plugins.
 */
export interface BlockTypeDefinition {
  /** Local block ID (without plugin prefix) */
  id: string;

  /** i18n key for display name */
  nameKey: string;

  /** i18n key for description */
  descriptionKey: string;

  /** Category for UI grouping */
  category: BlockCategory;

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
// Compiled Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fully compiled block ready for registration.
 */
export interface CompiledBlock extends BlockTypeDefinition {
  handlers: BlockHandlers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Runtime Instance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime instance of a block in a workflow.
 */
export interface BlockRuntimeInstance {
  /** Unique instance ID */
  id: string;

  /** Block type */
  type: string;

  /** Configuration */
  config: Record<string, unknown>;

  /** Current state */
  state: BlockState;

  /** Active timers (for cleanup) */
  timers: Set<ReturnType<typeof setTimeout>>;

  /** Buffered events (when paused) */
  buffer: Array<{ portId: string; data: Serializable }>;
}
