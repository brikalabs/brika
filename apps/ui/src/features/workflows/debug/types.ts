/**
 * Debug Types
 *
 * Shared types for workflow debugging.
 */

/** Event types from the debug stream */
export interface DebugEvent {
  type: string;
  workflowId?: string;
  blockId?: string;
  port?: string;
  data?: unknown;
  level?: string;
  message?: string;
  timestamp: number;
}

/** Filter options for debug events */
export type DebugFilter = 'all' | 'logs' | 'emits';
