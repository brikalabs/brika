/**
 * Typed IPC Channel
 *
 * Core channel abstraction with full type inference from contracts.
 */

import { BrikaError, errors, isBrikaErrorWire } from '@brika/errors';
import type { InputOf, MessageDef, OutputOf, PayloadOf, RpcDef } from './define';
import { measurePayloadBytes } from './payload-size';

/**
 * Default per-message payload cap (16 MiB). Deliberately generous so LAN/dev
 * workloads and reasonable binary blobs pass untouched; it exists to stop a
 * runaway/hostile plugin from OOMing the host, not to police normal traffic.
 */
export const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

/** Direction a payload-limit violation was detected in. */
export type PayloadLimitDirection = 'send' | 'handle';

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
  timer?: Timer;
}

/** Minimal schema interface for runtime validation (duck-typed from Zod). */
interface ParseableSchema {
  safeParse(
    data: unknown
  ): { success: true; data: unknown } | { success: false; error: { message: string } };
}

type ParseResult = { ok: true; data: unknown } | { ok: false; error: string };

function toErrorWire(e: unknown) {
  if (e instanceof BrikaError) {
    return e.toWire();
  }
  const message = e instanceof Error ? e.message : String(e);
  return errors.internal({ cause: e, message }).toWire();
}

function validatePayload(
  schema: ParseableSchema | undefined,
  payload: unknown
): ParseResult | undefined {
  if (!schema) {
    return undefined;
  }
  const result = schema.safeParse(payload);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error.message };
}

/** Channel options */
export interface ChannelOptions {
  /** Send function */
  send: SendFn;
  /** Default RPC timeout in ms (default: 30000) */
  defaultTimeoutMs?: number;
  /** Called when channel closes */
  onClose?: () => void;
  /**
   * Per-message payload cap in bytes, enforced on both outbound `send` and
   * inbound `handle`. Defaults to {@link DEFAULT_MAX_PAYLOAD_BYTES}. The size
   * is an approximation of the structured-clone wire size (see
   * `measurePayloadBytes`) — exact byte counts aren't recoverable cheaply
   * under Bun's `serialization: 'advanced'`.
   */
  maxPayloadBytes?: number;
  /**
   * Called when a message is rejected for exceeding `maxPayloadBytes`. Receives
   * the typed {@link BrikaError} (`IPC_PAYLOAD_TOO_LARGE`) so callers can log,
   * surface, or tear down the connection instead of the message being silently
   * dropped.
   */
  onPayloadLimitExceeded?: (error: BrikaError, direction: PayloadLimitDirection) => void;
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
  readonly #rawSend: SendFn;
  readonly #timeoutMs: number;
  readonly #onClose?: () => void;
  readonly #maxPayloadBytes: number;
  readonly #onPayloadLimitExceeded?: (error: BrikaError, direction: PayloadLimitDirection) => void;

  readonly #messageHandlers = new Map<string, Set<(payload: unknown) => void | Promise<void>>>();
  readonly #messageSchemas = new Map<string, ParseableSchema>();
  readonly #rpcHandlers = new Map<string, (input: unknown) => unknown>();
  readonly #rpcSchemas = new Map<string, ParseableSchema>();
  readonly #pending = new Map<number, PendingRequest<unknown>>();

  #nextId = 1;
  #closed = false;

  constructor(options: ChannelOptions) {
    this.#rawSend = options.send;
    this.#timeoutMs = options.defaultTimeoutMs ?? 30_000;
    this.#onClose = options.onClose;
    this.#maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
    this.#onPayloadLimitExceeded = options.onPayloadLimitExceeded;
  }

  /**
   * Outbound size guard. Measures the structured payload and drops oversized
   * messages instead of forwarding them, surfacing a typed error. Returns
   * `true` when the message was forwarded, `false` when it was rejected.
   */
  #send(msg: WireMessage): boolean {
    const size = measurePayloadBytes(msg, this.#maxPayloadBytes);
    if (size > this.#maxPayloadBytes) {
      this.#onPayloadLimitExceeded?.(
        errors.ipcPayloadTooLarge({
          limit: this.#maxPayloadBytes,
          size: Number.isFinite(size) ? size : this.#maxPayloadBytes,
          direction: 'send',
          messageType: msg.t,
        }),
        'send'
      );
      return false;
    }
    this.#rawSend(msg);
    return true;
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
    if (this.#closed) {
      return;
    }
    this.#send({
      t: def.name,
      ...(payload as object),
    });
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
      this.#messageSchemas.set(def.name, def.schema);
    }
    handlers.add(handler as (payload: unknown) => void | Promise<void>);

    return () => {
      handlers?.delete(handler as (payload: unknown) => void | Promise<void>);
      if (handlers?.size === 0) {
        this.#messageHandlers.delete(def.name);
        this.#messageSchemas.delete(def.name);
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
    this.#rpcSchemas.set(def.name, def.input);
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
      const timer =
        timeout > 0
          ? setTimeout(() => {
              this.#pending.delete(id);
              reject(new Error(`RPC timeout: ${def.name} (id=${id}) after ${timeout}ms`));
            }, timeout)
          : undefined;

      this.#pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      const forwarded = this.#send({
        t: def.name,
        _id: id,
        ...(input as object),
      });
      if (!forwarded) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(
          errors.ipcPayloadTooLarge({
            limit: this.#maxPayloadBytes,
            size: this.#maxPayloadBytes,
            direction: 'send',
            messageType: def.name,
          })
        );
      }
    });
  }

  /**
   * Handle an incoming wire message
   */
  async handle(raw: WireMessage): Promise<void> {
    if (this.#closed) {
      return;
    }

    const size = measurePayloadBytes(raw, this.#maxPayloadBytes);
    if (size > this.#maxPayloadBytes) {
      this.#onPayloadLimitExceeded?.(
        errors.ipcPayloadTooLarge({
          limit: this.#maxPayloadBytes,
          size: Number.isFinite(size) ? size : this.#maxPayloadBytes,
          direction: 'handle',
          messageType: raw.t,
        }),
        'handle'
      );
      return;
    }

    const { t: type, _id: id, ...payload } = raw;

    // Try handling as RPC response
    if (this.handleRpcResponse(type, id, payload)) {
      return;
    }

    // Try handling as RPC request
    if (await this.handleRpcRequest(type, id, payload)) {
      return;
    }

    // Handle as regular message
    this.handleRegularMessage(type, payload);
  }

  /**
   * Handle RPC response (result of a previous call)
   */
  private handleRpcResponse(
    type: string,
    id: number | undefined,
    payload: Record<string, unknown>
  ): boolean {
    if (type.endsWith('Result') && id !== undefined) {
      const pending = this.#pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.#pending.delete(id);
        const result = 'result' in payload ? payload.result : payload;
        // Reconstruct typed BrikaErrors → reject instead of resolve
        if (isBrikaErrorWire(result)) {
          pending.reject(BrikaError.fromWire(result));
        } else {
          pending.resolve(result);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Handle RPC request (incoming call)
   */
  private async handleRpcRequest(
    type: string,
    id: number | undefined,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const rpcHandler = this.#rpcHandlers.get(type);
    if (rpcHandler && id !== undefined) {
      const parsed = validatePayload(this.#rpcSchemas.get(type), payload);
      if (parsed && !parsed.ok) {
        this.#send({
          t: `${type}Result`,
          _id: id,
          result: errors.invalidInput({}, { message: parsed.error }).toWire(),
        });
        return true;
      }

      try {
        const result = await rpcHandler(parsed ? parsed.data : payload);
        this.#send({
          t: `${type}Result`,
          _id: id,
          result,
        });
      } catch (e) {
        // Preserve typed error codes across the wire. Non-BrikaError throws
        // collapse to a generic INTERNAL envelope so the wire shape stays
        // uniform — the client side sees a thrown BrikaError either way.
        this.#send({
          t: `${type}Result`,
          _id: id,
          result: toErrorWire(e),
        });
      }
      return true;
    }
    return false;
  }

  /**
   * Handle regular message (not RPC)
   */
  private async handleRegularMessage(
    type: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const handlers = this.#messageHandlers.get(type);
    if (handlers) {
      const parsed = validatePayload(this.#messageSchemas.get(type), payload);
      if (parsed && !parsed.ok) {
        console.error(`[ipc] Invalid payload for "${type}": ${parsed.error}`);
        return;
      }
      const data = parsed ? parsed.data : payload;

      for (const handler of handlers) {
        try {
          await handler(data);
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
    if (this.#closed) {
      return;
    }
    this.#closed = true;

    const err = error ?? new Error('Channel closed');
    for (const [_, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.#pending.clear();
    this.#messageHandlers.clear();
    this.#messageSchemas.clear();
    this.#rpcHandlers.clear();
    this.#rpcSchemas.clear();
    this.#onClose?.();
  }
}
