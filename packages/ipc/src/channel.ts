/**
 * Typed IPC Channel
 *
 * Core channel abstraction with full type inference from contracts.
 */

import type { InputOf, MessageDef, OutputOf, PayloadOf, RpcDef } from './define';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Wire message format */
export interface WireMessage {
  t: string;
  _id?: number;

  [key: string]: unknown;
}

/** Send function */
export type SendFn = (msg: WireMessage) => void;

/** Message handler */
export type MessageHandler<T extends MessageDef> = (payload: PayloadOf<T>) => void | Promise<void>;

/** RPC handler */
export type RpcHandler<T extends RpcDef> = (
  input: InputOf<T>
) => OutputOf<T> | Promise<OutputOf<T>>;

/** Pending RPC request */
interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: Timer;
}

/** Channel options */
export interface ChannelOptions {
  /** Send function */
  send: SendFn;
  /** Default RPC timeout in ms (default: 30000) */
  defaultTimeoutMs?: number;
  /** Called when channel closes */
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed IPC Channel
 *
 * @example
 * ```ts
 * import { hello, callTool } from "@brika/ipc/contract";
 *
 * const channel = new Channel({ send: (msg) => process.send(msg) });
 *
 * // Send messages
 * channel.send(hello, { plugin: { id: "test", version: "1.0" } });
 *
 * // Handle messages
 * channel.on(hello, ({ plugin }) => console.log(plugin.id));
 *
 * // Implement RPC
 * channel.implement(callTool, async ({ tool, args }) => {
 *   return { ok: true };
 * });
 *
 * // Call RPC
 * const result = await channel.call(callTool, { tool: "x", args: {}, ctx });
 * ```
 */
export class Channel {
  readonly #send: SendFn;
  readonly #timeoutMs: number;
  readonly #onClose?: () => void;

  readonly #messageHandlers = new Map<string, Set<(payload: unknown) => void | Promise<void>>>();
  readonly #rpcHandlers = new Map<string, (input: unknown) => unknown | Promise<unknown>>();
  readonly #pending = new Map<number, PendingRequest<unknown>>();

  #nextId = 1;
  #closed = false;

  constructor(options: ChannelOptions) {
    this.#send = options.send;
    this.#timeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.#onClose = options.onClose;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Send (Fire-and-Forget)
  // ─────────────────────────────────────────────────────────────────────────

  get isClosed(): boolean {
    return this.#closed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // On (Message Handler)
  // ─────────────────────────────────────────────────────────────────────────

  get pendingCount(): number {
    return this.#pending.size;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Implement (RPC Handler)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send a message
   */
  send<T extends MessageDef>(def: T, payload: PayloadOf<T>): void {
    if (this.#closed) return;
    this.#send({ t: def.name, ...(payload as object) });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // On (Message Handler)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a message handler
   */
  on<T extends MessageDef>(def: T, handler: MessageHandler<T>): () => void {
    let handlers = this.#messageHandlers.get(def.name);
    if (!handlers) {
      handlers = new Set();
      this.#messageHandlers.set(def.name, handlers);
    }
    handlers.add(handler as (payload: unknown) => void | Promise<void>);

    return () => {
      handlers?.delete(handler as (payload: unknown) => void | Promise<void>);
      if (handlers?.size === 0) {
        this.#messageHandlers.delete(def.name);
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Implement (RPC Handler)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Implement an RPC handler
   */
  implement<T extends RpcDef>(def: T, handler: RpcHandler<T>): void {
    if (this.#rpcHandlers.has(def.name)) {
      throw new Error(`RPC already implemented: ${def.name}`);
    }
    this.#rpcHandlers.set(def.name, handler as (input: unknown) => unknown);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Call (RPC Client)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Call an RPC and wait for response
   */
  call<T extends RpcDef>(def: T, input: InputOf<T>, timeoutMs?: number): Promise<OutputOf<T>> {
    if (this.#closed) {
      return Promise.reject(new Error(`Channel closed, cannot call ${def.name}`));
    }

    const id = this.#nextId++;
    const timeout = timeoutMs ?? this.#timeoutMs;

    return new Promise<OutputOf<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`RPC timeout: ${def.name} (id=${id}) after ${timeout}ms`));
      }, timeout);

      this.#pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.#send({ t: def.name, _id: id, ...(input as object) });
    });
  }

  /**
   * Handle an incoming wire message
   */
  async handle(raw: WireMessage): Promise<void> {
    if (this.#closed) return;

    const { t: type, _id: id, ...payload } = raw;

    // Check if it's a response to a pending RPC
    if (type.endsWith('Result') && id !== undefined) {
      const pending = this.#pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.#pending.delete(id);
        // Extract result from payload if present
        pending.resolve('result' in payload ? payload.result : payload);
        return;
      }
    }

    // Check if it's an RPC request (has _id and we have a handler)
    const rpcHandler = this.#rpcHandlers.get(type);
    if (rpcHandler && id !== undefined) {
      try {
        const result = await rpcHandler(payload);
        this.#send({ t: `${type}Result`, _id: id, result });
      } catch (e) {
        this.#send({
          t: `${type}Result`,
          _id: id,
          result: { ok: false, error: String(e) },
        });
      }
      return;
    }

    // It's a regular message
    const handlers = this.#messageHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(payload);
        } catch (e) {
          console.error(`Handler error for ${type}:`, e);
        }
      }
    }
  }

  /**
   * Close the channel
   */
  close(error?: Error): void {
    if (this.#closed) return;
    this.#closed = true;

    const err = error ?? new Error('Channel closed');
    for (const [_, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.#pending.clear();
    this.#messageHandlers.clear();
    this.#rpcHandlers.clear();
    this.#onClose?.();
  }
}
