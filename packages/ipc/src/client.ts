/**
 * IPC Client - Plugin-side
 *
 * Clean typed API for plugins to communicate with the Hub.
 *
 * When the hub's prelude is loaded (via --preload), the Client reuses the
 * prelude's Channel from globalThis.__brika_ipc instead of creating its own.
 * This avoids double message handling and lets the prelude own all system
 * concerns (ping, stop, timezone).
 *
 * Uses Bun's native IPC with advanced serialization which supports:
 * - Uint8Array, ArrayBuffer (native binary, no base64!)
 * - Date, Map, Set, RegExp
 * - All structuredClone compatible types
 *
 * @see https://bun.sh/docs/runtime/child-process#inter-process-communication-ipc
 */

import { Channel, type WireMessage } from './channel';
import { applyChannelDelegate, type ChannelDelegateMethods } from './channel-delegate';
import { hello, type PluginInfo, ready, stop } from './contract';
import type { IpcGlobal } from './global';

/** Client options */
export interface ClientOptions {
  /** Default RPC timeout in ms (only used when prelude is not loaded) */
  defaultTimeoutMs?: number;
}

/**
 * IPC Client for plugins
 *
 * @example
 * ```ts
 * import { createClient } from "@brika/ipc";
 * import { callTool, registerTool } from "@brika/ipc/contract";
 *
 * const client = createClient();
 *
 * // Implement RPC handlers
 * client.implement(callTool, async ({ tool, args }) => {
 *   return { ok: true, content: "Done" };
 * });
 *
 * // Send messages
 * client.send(registerTool, { tool: { id: "set", description: "Set timer" } });
 *
 * // Start
 * client.start({ id: "@brika/plugin-timer", version: "0.1.0" });
 * ```
 */
export class Client {
  readonly #channel: Channel;
  readonly #prelude: IpcGlobal | undefined;
  readonly #stopHandlers: Array<() => void | Promise<void>> = [];

  constructor(options: ClientOptions = {}) {
    if (typeof process.send !== 'function') {
      throw new TypeError('IPC Client requires process.send - spawn with IPC enabled');
    }

    const prelude = (globalThis as Record<string, unknown>).__brika_ipc as IpcGlobal | undefined;

    if (prelude) {
      // Prelude owns the Channel, message listener, ping, stop, and disconnect.
      // We just reuse it.
      this.#channel = prelude.channel;
      this.#prelude = prelude;
    } else {
      // No prelude: create our own channel and wire up process IPC.
      this.#prelude = undefined;

      this.#channel = new Channel({
        send: (msg) => process.send?.(msg),
        defaultTimeoutMs: options.defaultTimeoutMs,
        onClose: () => this.#cleanup(),
      });

      process.on('message', (msg: WireMessage) => {
        this.#channel.handle(msg);
      });

      process.on('disconnect', () => {
        this.#cleanup();
      });

      this.#channel.on(stop, async () => {
        await this.#runStopHandlers();
        process.exit(0);
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core API
  // ─────────────────────────────────────────────────────────────────────────

  get channel(): Channel {
    return this.#channel;
  }

  // send, on, implement, call — provided by applyChannelDelegate() below

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the client
   */
  start(plugin: PluginInfo): void {
    this.#channel.send(hello, {
      plugin,
    });
    this.#channel.send(ready, {});
  }

  /**
   * Register stop handler.
   * When the prelude is loaded, handlers are registered with the prelude's
   * stop sequence. Otherwise they run in the client's own stop handler.
   */
  onStop(handler: () => void | Promise<void>): void {
    if (this.#prelude) {
      this.#prelude.onStop(handler);
    } else {
      this.#stopHandlers.push(handler);
    }
  }

  async #runStopHandlers(): Promise<void> {
    for (let i = this.#stopHandlers.length; i-- > 0; ) {
      try {
        await this.#stopHandlers[i]?.();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  #cleanup(): void {
    process.removeAllListeners('message');
    process.removeAllListeners('disconnect');
  }
}

// Apply shared send/on/implement/call delegate methods
export interface Client extends ChannelDelegateMethods {}
applyChannelDelegate(Client);

/**
 * Create a new IPC client
 */
export function createClient(options?: ClientOptions): Client {
  return new Client(options);
}
