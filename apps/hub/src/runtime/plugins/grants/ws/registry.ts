/**
 * Per-plugin handle registry for open WebSocket connections.
 *
 * Each plugin's `GrantRegistry` closure gets one of these; two plugins
 * never share handles. `open()` returns an opaque id; `get()` looks
 * up a connection by id; `closeAll()` is called at plugin shutdown
 * to tear down any lingering sockets.
 */

import type { WsConnection } from './types';

let nextHandleSeq = 1;

export class WsHandleRegistry {
  readonly #handles = new Map<string, WsConnection>();
  readonly #maxOpen: number;

  constructor(maxOpen: number) {
    this.#maxOpen = maxOpen;
  }

  /** Register a connection. Returns the new handle id. */
  register(conn: WsConnection): string {
    const id = `ws_${nextHandleSeq++}`;
    this.#handles.set(id, conn);
    return id;
  }

  /** Look up a connection by id, or null if it's gone. */
  get(id: string): WsConnection | null {
    return this.#handles.get(id) ?? null;
  }

  /**
   * Deregister and return the connection so the caller can close it.
   * Returns null if the id wasn't known.
   */
  take(id: string): WsConnection | null {
    const conn = this.#handles.get(id);
    if (!conn) {
      return null;
    }
    this.#handles.delete(id);
    return conn;
  }

  /** True iff opening another socket would exceed the per-plugin cap. */
  atCapacity(): boolean {
    return this.#handles.size >= this.#maxOpen;
  }

  size(): number {
    return this.#handles.size;
  }

  /** Close every open connection. Called on plugin shutdown. */
  closeAll(code = 1001, reason = 'plugin-shutdown'): void {
    for (const [id, conn] of this.#handles) {
      try {
        conn.close(code, reason);
      } catch {
        // Best effort during teardown.
      }
      this.#handles.delete(id);
    }
  }
}
