/**
 * IPC Client - Plugin-side
 *
 * Clean typed API for plugins to communicate with the Hub.
 */

import { Channel, type WireMessage } from './channel';
import { hello, type PluginInfo, ready, stop } from './contract';
import type { InputOf, MessageDef, OutputOf, PayloadOf, RpcDef } from './define';

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
 * import { createClient } from "@elia/ipc";
 * import { callTool, registerTool } from "@elia/ipc/contract";
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
 * client.start({ id: "@elia/plugin-timer", version: "0.1.0" });
 * ```
 */
export class Client {
  readonly #channel: Channel;
  readonly #stopHandlers: Array<() => void | Promise<void>> = [];

  constructor(options: ClientOptions = {}) {
    if (typeof process.send !== 'function') {
      throw new Error('IPC Client requires process.send - spawn with IPC enabled');
    }

    this.#channel = new Channel({
      send: (msg) => process.send?.(msg),
      defaultTimeoutMs: options.defaultTimeoutMs,
      onClose: () => this.#cleanup(),
    });

    // Listen for IPC messages
    process.on('message', (msg: WireMessage) => {
      this.#channel.handle(msg);
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

  /**
   * Send a message
   */
  send<T extends MessageDef>(def: T, payload: PayloadOf<T>): void {
    this.#channel.send(def, payload);
  }

  /**
   * Handle incoming messages
   */
  on<T extends MessageDef>(
    def: T,
    handler: (payload: PayloadOf<T>) => void | Promise<void>
  ): () => void {
    return this.#channel.on(def, handler);
  }

  /**
   * Implement an RPC
   */
  implement<T extends RpcDef>(
    def: T,
    handler: (input: InputOf<T>) => OutputOf<T> | Promise<OutputOf<T>>
  ): void {
    this.#channel.implement(def, handler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Call an RPC (to hub or other services)
   */
  call<T extends RpcDef>(def: T, input: InputOf<T>, timeoutMs?: number): Promise<OutputOf<T>> {
    return this.#channel.call(def, input, timeoutMs);
  }

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
    for (let i = this.#stopHandlers.length - 1; i >= 0; i--) {
      try {
        await this.#stopHandlers[i]();
      } catch {}
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Low-level
  // ─────────────────────────────────────────────────────────────────────────

  #cleanup(): void {
    process.removeAllListeners('message');
  }
}

/**
 * Create a new IPC client
 */
export function createClient(options?: ClientOptions): Client {
  return new Client(options);
}
