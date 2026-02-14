/**
 * IPC Client - Plugin-side
 *
 * Clean typed API for plugins to communicate with the Hub.
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

/** Client options */
export interface ClientOptions {
  /** Default RPC timeout in ms */
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
 * client.implement(callTool, async ({ tool, args, ctx }) => {
 *   return { ok: true, content: "Done" };
 * });
 *
 * // Send messages
 * client.send(registerTool, { tool: { id: "set", description: "Set timer" } });
 *
 * // Start
 * client.start({ id: "@brika/plugin-timer", version: "0.1.0" });
 * ```
 *
 * @example Binary data works natively (no base64!):
 * ```ts
 * client.send(dataMessage, {
 *   payload: new Uint8Array([1, 2, 3, 4]),
 *   timestamp: new Date(),
 * });
 * ```
 */
export class Client {
  readonly #channel: Channel;
  readonly #stopHandlers: Array<() => void | Promise<void>> = [];

  constructor(options: ClientOptions = {}) {
    if (typeof process.send !== 'function') {
      throw new TypeError('IPC Client requires process.send - spawn with IPC enabled');
    }

    this.#channel = new Channel({
      send: (msg) => process.send?.(msg),
      defaultTimeoutMs: options.defaultTimeoutMs,
      onClose: () => this.#cleanup(),
    });

    // Listen for messages
    process.on('message', (msg: WireMessage) => {
      this.#channel.handle(msg);
    });

    process.on('disconnect', () => {
      this.#cleanup();
    });

    // Handle stop internally
    this.#channel.on(stop, async () => {
      await this.#runStopHandlers();
      process.exit(0);
    });
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
    this.#channel.send(hello, { plugin });
    this.#channel.send(ready, {});
  }

  /**
   * Register stop handler
   */
  onStop(handler: () => void | Promise<void>): void {
    this.#stopHandlers.push(handler);
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
