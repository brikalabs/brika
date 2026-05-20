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

import { z } from 'zod';
import type { CatalogedErrorCode, DataForCode } from './error-catalog';
import { httpStatusForCode, lookupCatalogEntry } from './error-catalog';

/**
 * Standard error codes — derived from the catalog in `./error-catalog.ts`.
 *
 * The full table (description, HTTP status, severity, recovery hint, `data`
 * shape, i18n key, category) lives in `ErrorCatalog`. Adding a new code is
 * a one-line edit there and this union widens automatically.
 *
 * The trailing `(string & Record<never, never>)` keeps the union open so
 * third-party plugins can mint their own codes — `instanceof BrikaError`
 * still narrows them, but they don't get catalog metadata until added.
 */
export type BrikaErrorCode = CatalogedErrorCode | (string & Record<never, never>);

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
 * Zod schema for the wire envelope discriminator. Validates the load-bearing
 * fields (`_rpcError === true`, `code`, `message`); the optional `data`,
 * `cause`, `stack` are accepted via passthrough so unknown extensions
 * round-trip without being dropped.
 */
const BrikaErrorWireSchema = z
  .object({
    _rpcError: z.literal(true),
    code: z.string(),
    message: z.string(),
  })
  .loose();

/**
 * Type guard for wire-format errors. Returns true for the unified
 * `BrikaErrorWire` shape and for any legacy variant that still uses the
 * `_rpcError` discriminator.
 */
export function isBrikaErrorWire(value: unknown): value is BrikaErrorWire {
  return BrikaErrorWireSchema.safeParse(value).success;
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
    const cause = serializeCause(this.cause);
    const data =
      this.data !== undefined && Object.keys(this.data).length > 0 ? this.data : undefined;
    const stack = includeStack && this.stack !== undefined ? this.stack : undefined;
    return {
      _rpcError: true,
      code: this.code,
      message: this.message,
      ...(data === undefined ? {} : { data }),
      ...(cause === undefined ? {} : { cause }),
      ...(stack === undefined ? {} : { stack }),
    };
  }

  /**
   * Type guard that narrows an unknown error to a `BrikaError` with the
   * given catalogued code, *and* narrows `.data` to the schema declared
   * for that code in the catalog. Use as the natural catch idiom:
   *
   * @example
   * ```ts
   * try {
   *   await ctx.net.fetch({ url });
   * } catch (e) {
   *   if (BrikaError.is(e, 'NET_HOST_NOT_ALLOWED')) {
   *     // e.code is the literal 'NET_HOST_NOT_ALLOWED'
   *     // e.data is { host: string; allow: string[] } | undefined
   *     log(`Blocked host: ${e.data?.host}`);
   *   } else {
   *     throw e;
   *   }
   * }
   * ```
   *
   * Trust comes from the catalog: a handler that throws this code is
   * contractually required to populate `data` per the catalog's Zod
   * schema. No runtime parse happens here — that would be a defensive
   * check, and the schema is the contract.
   */
  static is<C extends CatalogedErrorCode>(
    err: unknown,
    code: C
  ): err is BrikaError & { readonly code: C; readonly data?: Readonly<DataForCode<C>> } {
    return err instanceof BrikaError && err.code === code;
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
// HTTP boundary mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for the outer envelope `brikaErrorToResponse` emits.
 * Exported so callers (UI fetchers, route-proxy translators, remote-access
 * client) can `safeParse` an arbitrary JSON body without `as` casts or
 * hand-rolled typeof checks.
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
    i18nKey: z.string().optional(),
    developerHint: z.string().optional(),
  }),
});

/** Shape returned in the `error` body of a `brikaErrorToResponse` result. */
export type ErrorResponseBody = z.infer<typeof ErrorResponseSchema>['error'];

/**
 * Convert any throw into a typed HTTP `Response`. A `BrikaError` produces
 * a structured envelope with the catalog's `httpStatus`, `i18nKey`, and
 * `developerHint` attached — useful at hub route boundaries so clients
 * (the UI, remote-access RPC, plugin route handlers) can branch on the
 * code instead of grepping a stringified message.
 *
 * Non-`BrikaError` throws collapse to `{ code: 'INTERNAL', message:
 * 'Internal server error' }` with status 500 — the original throw's
 * `.message` is never leaked through the HTTP boundary.
 *
 * @example
 * ```ts
 * try {
 *   return await handler(req);
 * } catch (err) {
 *   return brikaErrorToResponse(err);
 * }
 * ```
 */
export function brikaErrorToResponse(err: unknown): Response {
  if (err instanceof BrikaError) {
    const entry = lookupCatalogEntry(err.code);
    const body: ErrorResponseBody = {
      code: err.code,
      message: err.message,
      ...(err.data === undefined ? {} : { data: err.data }),
      ...(entry?.i18nKey === undefined ? {} : { i18nKey: entry.i18nKey }),
      ...(entry?.developerHint === undefined ? {} : { developerHint: entry.developerHint }),
    };
    return Response.json({ error: body }, { status: httpStatusForCode(err.code) });
  }
  const body: ErrorResponseBody = { code: 'INTERNAL', message: 'Internal server error' };
  return Response.json({ error: body }, { status: 500 });
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
