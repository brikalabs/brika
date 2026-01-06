/**
 * Workflow Types
 *
 * Core workflow and block configuration definitions.
 */

import type { PortRef } from './ports';

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Workspace metadata from the TOML header.
 */
export interface WorkspaceMeta {
  /** Unique workspace ID (user-friendly slug) */
  id: string;

  /** Display name */
  name: string;

  /** Description of what this workflow does */
  description?: string;

  /** Whether the workflow is enabled */
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Position in the visual editor.
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * A block configuration in a workflow (from TOML).
 */
export interface BlockConfig {
  /** Unique instance ID (user-friendly slug, e.g., "check-time") */
  id: string;

  /** Block type (full qualified: "@brika/blocks-builtin:condition") */
  type: string;

  /** Position in the visual editor */
  position?: Position;

  /** Block configuration (validated against block type's configSchema) */
  config: Record<string, unknown>;

  /**
   * Input port connections.
   * Maps port ID to array of source port refs.
   */
  inputs: Record<string, PortRef[]>;

  /**
   * Output port connections.
   * Maps port ID to array of target port refs.
   */
  outputs: Record<string, PortRef[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete workflow definition.
 * Stored as TOML files with plugin dependencies.
 */
export interface Workflow {
  /** Schema version for forward compatibility */
  version: string;

  /** Workspace metadata */
  workspace: WorkspaceMeta;

  /**
   * Plugin dependencies.
   * Maps plugin name to version range.
   */
  plugins: Record<string, string>;

  /** Block configurations in this workflow */
  blocks: BlockConfig[];
}
