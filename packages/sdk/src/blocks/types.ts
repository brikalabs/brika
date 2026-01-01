/**
 * Block System Types
 * 
 * Generic block definitions with multi-input/multi-output support.
 * All blocks are loaded from plugins via IPC.
 */

import type { Json } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Ports - Input/Output connection points
// ─────────────────────────────────────────────────────────────────────────────

/** A connection point on a block */
export interface BlockPort {
  /** Unique port ID (e.g., "in", "then", "else", "default") */
  id: string;
  /** Display name shown in UI */
  name: string;
  /** Optional type hint for autocomplete and validation */
  type?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Definition - Metadata for a block type
// ─────────────────────────────────────────────────────────────────────────────

/** JSON Schema subset for block configuration */
export interface BlockSchema {
  type: "object";
  properties?: Record<string, {
    type: "string" | "number" | "boolean" | "array" | "object";
    description?: string;
    default?: Json;
    enum?: Json[];
    items?: { type: string };
  }>;
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
  /** Category for grouping in UI (e.g., "flow", "logic", "actions", "data") */
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
// Block Context - Data available during execution
// ─────────────────────────────────────────────────────────────────────────────

/** Context passed to block execution */
export interface BlockContext {
  /** The triggering event */
  trigger: {
    type: string;
    payload: Json;
    source: string;
    ts: number;
  };
  /** Variables set during workflow execution */
  vars: Record<string, Json>;
  /** Data from the input port that triggered this block */
  input: Json;
  /** All input port values (for blocks with multiple inputs) */
  inputs: Record<string, Json>;
  /** Loop item (when inside a loop) */
  item?: Json;
  /** Loop index (when inside a loop) */
  index?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Runtime - Services available to blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Runtime services provided to block handlers */
export interface BlockRuntime {
  /** Call a registered tool */
  callTool(name: string, args: Record<string, Json>): Promise<Json>;
  /** Emit an event */
  emit(type: string, payload: Json): void;
  /** Log a message */
  log(level: "debug" | "info" | "warn" | "error", message: string): void;
  /** Evaluate an expression (e.g., "{{ trigger.payload.value }}") */
  evaluate<T = Json>(expression: string, ctx: BlockContext): T;
  /** Subscribe to events (for wait/listen blocks) */
  subscribe(pattern: string, handler: (e: { type: string; payload: Json }) => void): () => void;
  /** Set a workflow variable */
  setVar(name: string, value: Json): void;
  /** Get a workflow variable */
  getVar(name: string): Json | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Result - Output from block execution
// ─────────────────────────────────────────────────────────────────────────────

/** Result returned from block execution */
export interface BlockResult {
  /** Which output port to activate (port ID) */
  output?: string;
  /** Data to pass to the connected block */
  data?: Json;
  /** Stop the entire workflow */
  stop?: boolean;
  /** Error message if block failed */
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Handler - The execution function
// ─────────────────────────────────────────────────────────────────────────────

/** Block execution handler function */
export type BlockHandler<TConfig = Record<string, unknown>> = (
  config: TConfig,
  ctx: BlockContext,
  runtime: BlockRuntime
) => Promise<BlockResult> | BlockResult;

// ─────────────────────────────────────────────────────────────────────────────
// Compiled Block - Ready for registration
// ─────────────────────────────────────────────────────────────────────────────

/** A fully compiled block ready for registration */
export interface CompiledBlock extends BlockDefinition {
  /** The execution handler */
  execute: BlockHandler;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Types
// ─────────────────────────────────────────────────────────────────────────────

/** A connection between blocks */
export interface BlockConnection {
  /** Source block ID */
  from: string;
  /** Source output port ID (default: first output) */
  fromPort?: string;
  /** Target block ID */
  to: string;
  /** Target input port ID (default: first input) */
  toPort?: string;
}

/** A block instance in a workflow */
export interface WorkflowBlock {
  /** Unique block instance ID */
  id: string;
  /** Block type (references BlockDefinition.type) */
  type: string;
  /** Block configuration */
  config: Record<string, Json>;
  /** Position in the visual editor */
  position?: { x: number; y: number };
}

/** Workflow definition */
export interface Workflow {
  /** Unique workflow ID */
  id: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Whether the workflow is enabled */
  enabled?: boolean;
  /** Trigger configuration */
  trigger: {
    /** Event type to listen for */
    event: string;
    /** Optional filter on event payload */
    filter?: Record<string, Json>;
  };
  /** Blocks in this workflow */
  blocks: WorkflowBlock[];
  /** Connections between blocks */
  connections: BlockConnection[];
}

