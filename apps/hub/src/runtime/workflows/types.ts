/**
 * Automation Types
 *
 * Local type definitions for the automation engine.
 */

import type { Json } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Block
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowBlock {
  /** Block instance ID (unique within workflow) */
  id: string;
  /** Block type (pluginId:blockId) */
  type: string;
  /** Position in the visual editor */
  position?: { x: number; y: number };
  /** Block configuration */
  config?: Record<string, Json>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockConnection {
  /** Source block ID */
  from: string;
  /** Source port ID */
  fromPort?: string;
  /** Target block ID */
  to: string;
  /** Target port ID */
  toPort?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Status
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowStatus = 'running' | 'stopped' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────────────────────

export interface Workflow {
  /** Unique workflow ID */
  id: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Whether the workflow is enabled */
  enabled?: boolean;
  /** Current workflow status */
  status?: WorkflowStatus;
  /** Error message (when status is 'error') */
  error?: string;
  /** Timestamp when workflow was started (if running) */
  startedAt?: number;
  /** Block instances */
  blocks: WorkflowBlock[];
  /** Block connections */
  connections: BlockConnection[];
}
