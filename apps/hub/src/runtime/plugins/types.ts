import type { PluginChannel } from '@brika/ipc';
import type { PluginManifest } from '@brika/plugin';

/**
 * Internal representation of a running plugin process.
 */
export interface RunningPlugin {
  /** Reference identifier (package name or file: path) */
  ref: string;
  /** Plugin directory path */
  dir: string;
  /** Process ID */
  pid: number;
  /** IPC channel for communication */
  channel: PluginChannel;
  /** Registered block IDs */
  blocks: Set<string>;
  /** Event subscription patterns */
  subscriptions: Set<string>;
  /** Cleanup functions for event subscriptions */
  eventUnsubs: Array<() => void>;
  /** Last pong timestamp for heartbeat */
  lastPong: number;
  /** Heartbeat timer */
  heartbeat?: Timer;
  /** Plugin name (from package.json) */
  name: string;
  /** Unique identifier (deterministic hash of name) */
  uid: string;
  /** Plugin version */
  version: string;
  /** Full plugin metadata from package.json */
  metadata: PluginManifest;
  /** Timestamp when plugin was started */
  startedAt: number;
  /** Available translation locales */
  locales: string[];
}
