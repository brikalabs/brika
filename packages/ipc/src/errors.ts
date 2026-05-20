/**
 * Brika error system.
 *
 * One base class — `BrikaError` — that every typed error in the platform
 * extends. Wire format `BrikaErrorWire` round-trips code, message, data,
 * an optional cause chain, and (optionally) stack info across IPC.
 *
 * `RpcError` is now a thin extension of `BrikaError` kept for back-compat
 * with existing call sites; new code should use `BrikaError` (or a domain
 * subclass) directly.
 *
 * @example Throwing with structured data + cause
 * ```ts
 * try {
 *   await fs.readFile(path);
 * } catch (e) {
 *   throw new BrikaError('NOT_FOUND', `Cannot read "${path}"`, {
 *     data: { path },
 *     cause: e,
 *   });
 * }
 * ```
 *
 * @example Catching across the IPC boundary
 * ```ts
 * try {
 *   await client.call(getThing, { id });
 * } catch (err) {
 *   if (err instanceof BrikaError && err.code === 'NOT_FOUND') {
 *     console.log('missing:', err.data?.path);
 *     console.log('caused by:', err.cause);  // preserved across IPC
 *   }
 * }
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Well-Known Error Codes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard error codes shared across the platform. Custom codes are allowed —
 * the union is open-ended for extensibility.
 *
 * | Code                | Meaning                                                |
 * |---------------------|--------------------------------------------------------|
 * | `PERMISSION_DENIED` | Caller lacks a required permission grant               |
 * | `NOT_FOUND`         | Requested resource does not exist                      |
 * | `INVALID_INPUT`     | Input failed validation or was malformed               |
 * | `INVALID_OUTPUT`    | Returned value failed validation (handler bug)         |
 * | `TIMEOUT`           | Operation exceeded its deadline                        |
 * | `UNAVAILABLE`       | Dependency (network, file, registry) is unavailable    |
 * | `INTERNAL`          | Unexpected internal error                              |
 */
export type BrikaErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_OUTPUT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'INTERNAL'
  | (string & Record<never, never>);

/** Alias kept for back-compat with callers that imported `RpcErrorCode`. */
export type RpcErrorCode = BrikaErrorCode;

// ─────────────────────────────────────────────────────────────────────────────
// Wire Format
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON-serializable error envelope.
 *
 * Carries enough context that the receiving side can rebuild a typed error
 * with the original code, message, data, cause chain, and (optionally) stack.
 * `_rpcError: true` keeps the legacy discriminator so older Channel code that
 * still uses `isRpcErrorWire` keeps working.
 */
export interface BrikaErrorWire {
  readonly _rpcError: true;
  readonly code: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  /** Recursive cause chain — already-serialized wire envelope. */
  readonly cause?: BrikaErrorWire | { message: string; name?: string };
  /** Optional stack trace. Cheap to include and very useful in dev. */
  readonly stack?: string;
}

/** Legacy alias retained so existing imports keep compiling. */
export type RpcErrorWire = BrikaErrorWire;

/**
 * Type guard for wire-format errors. Returns true for the unified
 * `BrikaErrorWire` shape and for any legacy variant that still uses the
 * `_rpcError` discriminator.
 */
export function isBrikaErrorWire(value: unknown): value is BrikaErrorWire {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_rpcError' in value &&
    (value as Record<string, unknown>)._rpcError === true &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

/** Alias kept for back-compat with callers that imported `isRpcErrorWire`. */
export const isRpcErrorWire = isBrikaErrorWire;

/** Serialize an arbitrary cause value to a compact wire shape. */
function serializeCause(cause: unknown): BrikaErrorWire['cause'] | undefined {
  if (cause === undefined || cause === null) {
    return undefined;
  }
  if (cause instanceof BrikaError) {
    return cause.toWire();
  }
  if (cause instanceof Error) {
    return { message: cause.message, name: cause.name };
  }
  if (typeof cause === 'string') {
    return { message: cause };
  }
  // Number, boolean, bigint, symbol, object literal — JSON.stringify gives
  // a more useful representation than the default Object.toString.
  try {
    return { message: JSON.stringify(cause) };
  } catch {
    return { message: Object.prototype.toString.call(cause) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BrikaError — the platform-wide base class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The single base class every typed error in the Brika platform extends.
 *
 *   - `code`    machine-readable identifier, see `BrikaErrorCode`
 *   - `data`    structured context, JSON-serializable
 *   - `cause`   any thrown value — preserved across IPC as best-effort
 *
 * `cause` follows ES2022 semantics; pass via the options bag.
 */
export class BrikaError extends Error {
  readonly code: BrikaErrorCode;
  /**
   * Structured context. Undefined when no data was supplied — matches the
   * legacy `RpcError.data` shape so existing callers using
   * `err.data?.foo` keep working unchanged.
   */
  readonly data?: Readonly<Record<string, unknown>>;
  // Re-declared so TypeScript narrows the property type; the runtime is
  // ES2022's standard Error.cause, set by `super` when provided.
  override readonly cause?: unknown;

  constructor(
    code: BrikaErrorCode,
    message: string,
    opts?: { data?: Record<string, unknown>; cause?: unknown }
  ) {
    super(message);
    this.name = 'BrikaError';
    this.code = code;
    // Set cause via defineProperty: the class-field declaration of `cause`
    // (`override readonly cause?: unknown`) zeroes out whatever the ES2022
    // Error options bag would have written, so we assign explicitly.
    if (opts?.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: opts.cause,
        enumerable: false,
        writable: false,
        configurable: true,
      });
    }
    if (opts?.data && Object.keys(opts.data).length > 0) {
      this.data = Object.freeze({ ...opts.data });
    }
  }

  /**
   * Convert to a JSON-serializable envelope.
   *
   * `includeStack` defaults to **false** so the wire shape matches the
   * legacy `RpcError.toWire()` output exactly — existing tests that
   * snapshot the envelope keep passing. Opt in with `toWire(true)` from
   * the IPC layer to attach the local stack for richer remote debugging.
   */
  toWire(includeStack = false): BrikaErrorWire {
    const wire: BrikaErrorWire = {
      _rpcError: true,
      code: this.code,
      message: this.message,
    };
    if (this.data !== undefined && Object.keys(this.data).length > 0) {
      (wire as { data?: Record<string, unknown> }).data = this.data as Record<string, unknown>;
    }
    const cause = serializeCause(this.cause);
    if (cause !== undefined) {
      (wire as { cause?: BrikaErrorWire['cause'] }).cause = cause;
    }
    if (includeStack && this.stack !== undefined) {
      (wire as { stack?: string }).stack = this.stack;
    }
    return wire;
  }

  /**
   * Rebuild a BrikaError from its wire envelope. The reconstructed instance
   * carries the original code, message, and data; the cause is materialized
   * as either a `BrikaError` (if the wire frame is a full envelope) or a
   * plain `Error` (if it was a primitive throw). The original stack is
   * appended to the new instance's stack so debugging surfaces it.
   */
  static fromWire(wire: BrikaErrorWire): BrikaError {
    const cause = materializeCause(wire.cause);
    const err = new BrikaError(wire.code, wire.message, {
      data: wire.data,
      cause,
    });
    if (wire.stack !== undefined) {
      err.stack = `${err.stack ?? ''}\n--- remote stack ---\n${wire.stack}`;
    }
    return err;
  }
}

function materializeCause(wire: BrikaErrorWire['cause']): unknown {
  if (wire === undefined) {
    return undefined;
  }
  if ('_rpcError' in wire) {
    return BrikaError.fromWire(wire);
  }
  const e = new Error(wire.message);
  if (wire.name !== undefined) {
    e.name = wire.name;
  }
  return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// RpcError — back-compat shim
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Back-compat alias. Existing callers that constructed `new RpcError(code,
 * message, data)` keep working; new code should use `BrikaError` directly
 * or a domain subclass.
 *
 * `instanceof RpcError` still narrows correctly because RpcError extends
 * BrikaError. Wire-shape and `code`/`data`/`cause` access are unchanged.
 */
export class RpcError extends BrikaError {
  constructor(code: BrikaErrorCode, message: string, data?: Record<string, unknown>) {
    super(code, message, data === undefined ? undefined : { data });
    this.name = 'RpcError';
  }

  /** Legacy alias: callers used `RpcError.fromWire` before BrikaError existed. */
  static override fromWire(wire: BrikaErrorWire): RpcError {
    const cause = materializeCause(wire.cause);
    const err = new RpcError(wire.code, wire.message, wire.data);
    if (cause !== undefined) {
      Object.defineProperty(err, 'cause', { value: cause, enumerable: false });
    }
    if (wire.stack !== undefined) {
      err.stack = `${err.stack ?? ''}\n--- remote stack ---\n${wire.stack}`;
    }
    return err;
  }
}
