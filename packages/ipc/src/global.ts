/**
 * Global IPC hook.
 *
 * When a host script (e.g. Bun's --preload) sets globalThis.__brika_ipc,
 * the IPC Client reuses its Channel instead of creating a new one.
 *
 * The global is declared by @brika/sdk (which owns the full bridge type).
 * This module provides a minimal type for what the IPC Client needs.
 */

import type { Channel } from './channel';

/** Minimal shape the IPC Client reads from globalThis.__brika_ipc. */
export interface IpcGlobal {
  readonly channel: Channel;
  onStop(handler: () => void | Promise<void>): () => void;
}
