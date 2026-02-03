/**
 * IPC Host - Hub-side
 *
 * Manages plugin connections with full type safety.
 *
 * Uses Bun's native IPC with advanced serialization which supports:
 * - Uint8Array, ArrayBuffer (native binary, no base64!)
 * - Date, Map, Set, RegExp
 * - All structuredClone compatible types
 *
 * @see https://bun.sh/docs/runtime/child-process#inter-process-communication-ipc
 */

import { Channel, type WireMessage } from './channel';
import { ping, stop } from './contract';
import type { InputOf, MessageDef, OutputOf, PayloadOf, RpcDef } from './define';

/** Subprocess from Bun.spawn */
type Subprocess = ReturnType<typeof Bun.spawn>;

/** Maximum stderr lines to keep for error context */
const MAX_STDERR_LINES = 20;

/** Plugin channel options */
export interface PluginChannelOptions {
  /** Default RPC timeout in ms */
  defaultTimeoutMs?: number;
  /** Called when plugin disconnects */
  onDisconnect?: (error?: Error) => void;
  /** Called when stderr data is received */
  onStderr?: (line: string) => void;
}

/**
 * Plugin Channel - Hub-side connection to a plugin
 *
 * @example
 * ```ts
 * import { spawnPlugin } from "@brika/ipc";
 * import { callTool, hello, registerTool } from "@brika/ipc/contract";
 *
 * const plugin = spawnPlugin("bun", ["./plugin.ts"]);
 *
 * // Handle messages
 * plugin.on(hello, ({ plugin }) => console.log("Connected:", plugin.id));
 * plugin.on(registerTool, ({ tool }) => registry.add(tool));
 *
 * // Call RPCs
 * const result = await plugin.call(callTool, {
 *   tool: "set",
 *   args: { duration: 5000 },
 *   ctx: { traceId: "abc", source: "api" },
 * });
 * ```
 *
 * @example Binary data works natively:
 * ```ts
 * plugin.send(dataMessage, {
 *   payload: new Uint8Array([1, 2, 3, 4]),
 *   timestamp: new Date(),
 * });
 * ```
 */
export class PluginChannel {
  readonly #proc: Subprocess;
  readonly #channel: Channel;
  readonly #onDisconnect?: (error?: Error) => void;
  readonly #onStderr?: (line: string) => void;
  readonly #stderrBuffer: string[] = [];
  #disconnected = false;

  constructor(proc: Subprocess, options: PluginChannelOptions = {}) {
    this.#proc = proc;
    this.#onDisconnect = options.onDisconnect;
    this.#onStderr = options.onStderr;

    this.#channel = new Channel({
      send: (msg) => {
        if (this.#disconnected) return;
        try {
          proc.send(msg);
        } catch (e) {
          this.#handleDisconnect(e as Error);
        }
      },
      defaultTimeoutMs: options.defaultTimeoutMs,
      onClose: () => this.#handleDisconnect(),
    });

    // Pipe stderr
    this.#pipeStderr();

    // Monitor exit
    proc.exited.then((code) => {
      if (!this.#disconnected) {
        // Include recent stderr in error for better debugging
        const stderr = this.#stderrBuffer.join('\n').trim();
        const message = stderr
          ? `Process exited with code ${code}\n${stderr}`
          : `Process exited with code ${code}`;
        this.#handleDisconnect(new Error(message));
      }
    });
  }

  get isDisconnected(): boolean {
    return this.#disconnected;
  }

  get pid(): number {
    return this.#proc.pid;
  }

  get pendingCount(): number {
    return this.#channel.pendingCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core API
  // ─────────────────────────────────────────────────────────────────────────

  get channel(): Channel {
    return this.#channel;
  }

  get proc(): Subprocess {
    return this.#proc;
  }

  /**
   * Handle incoming message from plugin
   */
  handle(msg: WireMessage): void {
    this.#channel.handle(msg);
  }

  /**
   * Send a message to plugin
   */
  send<T extends MessageDef>(def: T, payload: PayloadOf<T>): void {
    this.#channel.send(def, payload);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Control
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Handle messages from plugin
   */
  on<T extends MessageDef>(
    def: T,
    handler: (payload: PayloadOf<T>) => void | Promise<void>
  ): () => void {
    return this.#channel.on(def, handler);
  }

  /**
   * Implement an RPC (hub responds to plugin requests)
   */
  implement<T extends RpcDef>(
    def: T,
    handler: (input: InputOf<T>) => OutputOf<T> | Promise<OutputOf<T>>
  ): void {
    this.#channel.implement(def, handler);
  }

  /**
   * Call an RPC on the plugin
   */
  call<T extends RpcDef>(def: T, input: InputOf<T>, timeoutMs?: number): Promise<OutputOf<T>> {
    return this.#channel.call(def, input, timeoutMs);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send stop signal
   */
  stop(): void {
    this.#channel.send(stop, {});
  }

  /**
   * Ping the plugin
   */
  async ping(timeoutMs?: number): Promise<number> {
    const ts = Date.now();
    await this.#channel.call(ping, { ts }, timeoutMs);
    return Date.now() - ts;
  }

  /**
   * Kill the plugin process
   */
  kill(signal?: number): void {
    try {
      this.#proc.kill(signal);
    } catch {
      // Process may already be dead
    }
    this.#handleDisconnect(new Error('Killed'));
  }

  #pipeStderr(): void {
    const stderr = this.#proc.stderr;
    if (!stderr) return;

    (async () => {
      const decoder = new TextDecoder();
      const reader = (stderr as ReadableStream<Uint8Array>).getReader();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              // Keep last 20 lines for error context
              this.#stderrBuffer.push(trimmed);
              if (this.#stderrBuffer.length > MAX_STDERR_LINES) {
                this.#stderrBuffer.shift();
              }
              this.#onStderr?.(trimmed);
            }
          }
        }
        if (buffer.trim()) {
          this.#stderrBuffer.push(buffer.trim());
          this.#onStderr?.(buffer.trim());
        }
      } catch {
        // Stream closed or errored - ignore
      }
    })();
  }

  #handleDisconnect(error?: Error): void {
    if (this.#disconnected) return;
    this.#disconnected = true;
    this.#channel.close(error);
    this.#onDisconnect?.(error);
  }
}

/** Options for spawning a plugin */
export interface SpawnPluginOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  defaultTimeoutMs?: number;
  onDisconnect?: (error?: Error) => void;
  onStderr?: (line: string) => void;
}

/**
 * Spawn a plugin with IPC
 *
 * Uses Bun's native IPC with 'advanced' serialization which supports:
 * - Uint8Array, ArrayBuffer (native binary, no base64!)
 * - Date, Map, Set, RegExp
 * - All structuredClone compatible types
 */
export function spawnPlugin(
  cmd: string,
  args: string[],
  options: SpawnPluginOptions = {}
): PluginChannel {
  let channel: PluginChannel;

  const proc = Bun.spawn([cmd, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    serialization: 'advanced',
    ipc: (msg) => {
      channel.handle(msg as WireMessage);
    },
  });

  channel = new PluginChannel(proc, {
    defaultTimeoutMs: options.defaultTimeoutMs,
    onDisconnect: options.onDisconnect,
    onStderr: options.onStderr,
  });

  return channel;
}
