/**
 * Block System Types
 *
 * Event-driven block definitions with multi-input/multi-output support.
 * All blocks are loaded from plugins via IPC.
 */

import type { Serializable } from '@brika/serializable';
import type { z } from 'zod';
import type { Json } from '../types';

// Re-export Serializable for convenience
export type { Serializable } from '@brika/serializable';

// ─────────────────────────────────────────────────────────────────────────────
// Ports - Input/Output connection points
// ─────────────────────────────────────────────────────────────────────────────

/** Port direction */
export type PortDirection = 'input' | 'output';

/**
 * A typed connection point on a block.
 * Ports have a direction and an optional Zod schema for type validation.
 */
export interface BlockPort {
  /** Unique port ID (e.g., "in", "then", "else", "default") */
  id: string;
  /** Port direction - connections only valid from output to input */
  direction: PortDirection;
  /** i18n key for display name (e.g., "blocks.condition.ports.then") */
  nameKey: string;
  /** i18n key for description tooltip */
  descriptionKey?: string;
  /**
   * Zod schema for port data validation.
   * - Output schemas define what data the port produces
   * - Input schemas define what data the port accepts
   * - z.unknown() accepts any type
   */
  schema?: z.ZodType;
  /**
   * JSON Schema for API serialization.
   * Generated from Zod schema for UI rendering.
   */
  jsonSchema?: Record<string, unknown>;
}

/**
 * Simplified port definition for defineBlock().
 * Direction and schema are inferred from context.
 */
export interface SimplePort {
  /** Unique port ID */
  id: string;
  /** Display name (or i18n key) */
  name: string;
  /** Optional Zod schema for type validation */
  schema?: z.ZodType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Definition - Metadata for a block type
// ─────────────────────────────────────────────────────────────────────────────

/** JSON Schema subset for block configuration */
export interface BlockSchema {
  type: 'object';
  properties?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object';
      description?: string;
      default?: Json;
      enum?: Json[];
      items?: { type: string };
    }
  >;
  required?: string[];
}

/** Block definition - the metadata describing a block type */
export interface BlockDefinition {
  /** Local block ID (without plugin prefix, e.g., "condition", "action") */
  id: string;
  /** Full qualified type (with plugin prefix, set on registration, e.g., "blocks-builtin:condition") */
  type?: string;
  /** Display name */
  name: string;
  /** Help text describing what the block does */
  description: string;
  /** Category for grouping in UI (free-form string, e.g., "flow", "logic", "actions") */
  category: string;
  /** Lucide icon name (e.g., "git-branch", "zap") */
  icon: string;
  /** Hex color for visual identification (e.g., "#f59e0b") */
  color: string;
  /** Input ports - empty array means this is a start/trigger block */
  inputs: BlockPort[];
  /** Output ports - empty array means this is a terminal block */
  outputs: BlockPort[];
  /** JSON Schema for block configuration */
  schema: BlockSchema;
  /** Plugin that provides this block (set on registration) */
  pluginId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Store - Per-block persistent state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-block state storage.
 * State is persisted and survives restarts.
 */
export interface StateStore {
  /** Get a value from state */
  get<T extends Serializable = Serializable>(key: string): T | undefined;
  /** Set a value in state */
  set(key: string, value: Serializable): void;
  /** Check if a key exists */
  has(key: string): boolean;
  /** Delete a key from state */
  delete(key: string): boolean;
  /** Clear all state */
  clear(): void;
  /** Get all keys */
  keys(): string[];
  /** Get entire state as record */
  getAll(): Record<string, Serializable>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Context - Data available during execution (Low-level)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Low-level context provided to block handlers.
 * For typed reactive context, see BlockContext in reactive.ts.
 */
export interface LowLevelBlockContext {
  /** Block instance ID */
  blockId: string;
  /** Workflow ID this block belongs to */
  workflowId: string;
  /** Block configuration (parsed from configSchema) */
  config: Record<string, unknown>;
  /** Per-block state storage (persisted) */
  state: StateStore;

  /**
   * Emit data to an output port.
   * This sends the data to all connected blocks.
   */
  emit(portId: string, data: Serializable): void;

  /** Log a message */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;

  /** Call a registered tool */
  callTool(toolId: string, args: Record<string, Serializable>): Promise<Serializable>;

  /** Schedule a callback after delay (for timers, debounce, etc.) */
  setTimeout(callback: () => void, ms: number): () => void;

  /** Schedule a repeating callback (for timers) */
  setInterval(callback: () => void, ms: number): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Handlers - Event-driven execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event-driven block handlers.
 * Blocks react to events rather than returning results.
 */
export interface BlockHandlers {
  /**
   * Called when the workflow starts.
   * Use for initialization, starting timers, etc.
   * Source blocks (0 inputs) typically emit their first event here.
   */
  onStart?(ctx: LowLevelBlockContext): void | Promise<void>;

  /**
   * Called when data arrives at an input port.
   * This is the main handler for processing events.
   *
   * @param portId - Which input port received the data
   * @param data - The data received
   * @param ctx - Block context with state and emit
   */
  onInput(portId: string, data: Serializable, ctx: LowLevelBlockContext): void | Promise<void>;

  /**
   * Called when the workflow stops.
   * Use for cleanup (clearing timers, closing connections, etc.)
   */
  onStop?(ctx: LowLevelBlockContext): void | Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compiled Block - Ready for registration
// ─────────────────────────────────────────────────────────────────────────────

/** A fully compiled block ready for registration */
export interface CompiledBlock extends BlockDefinition {
  /** Event handlers for this block type */
  handlers: BlockHandlers;
}
