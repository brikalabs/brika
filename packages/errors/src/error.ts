/**
 * BrikaError — typed platform error with wire round-trip.
 *
 * Every error that crosses an IPC, HTTP, or process boundary is a BrikaError.
 * Codes are looked up in {@link ErrorCatalog} for HTTP status, severity, and
 * i18n keys. Optional structured `data` is typed per code via Zod schemas.
 *
 * @example hub handler:
 * ```ts
 * import { errors } from '@brika/errors';
 * throw errors.permissionDenied({ permission: 'location' });
 * ```
 *
 * @example client side narrowing:
 * ```ts
 * if (BrikaError.is(err, 'PERMISSION_DENIED')) {
 *   console.log(err.data.permission); // string, narrowed via catalog schema
 * }
 * ```
 */

import { z } from 'zod';
import {
  type BrikaErrorCode,
  type CatalogedErrorCode,
  type DataForCode,
  lookupCatalogEntry,
} from './catalog';

// ─── Wire envelope schema ──────────────────────────────────────────────────

interface NestedCause {
  readonly message: string;
  readonly name?: string;
}

export interface BrikaErrorWire {
  readonly _brikaError: true;
  readonly code: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
  readonly cause?: BrikaErrorWire | NestedCause;
  readonly stack?: string;
}

const NestedCauseSchema: z.ZodType<NestedCause> = z.object({
  message: z.string(),
  name: z.string().optional(),
});

export const BrikaErrorWireSchema: z.ZodType<BrikaErrorWire> = z.object({
  _brikaError: z.literal(true),
  code: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  cause: z.union([z.lazy(() => BrikaErrorWireSchema), NestedCauseSchema]).optional(),
  stack: z.string().optional(),
});

/** True if `value` looks like a `BrikaError` wire envelope. */
export function isBrikaErrorWire(value: unknown): value is BrikaErrorWire {
  return BrikaErrorWireSchema.safeParse(value).success;
}

// ─── BrikaError class ──────────────────────────────────────────────────────

interface BrikaErrorOptions<D> {
  readonly data?: D;
  readonly cause?: unknown;
}

/** Observability hook signature. Called once per BrikaError construction. */
export type BrikaErrorThrowHandler = (err: BrikaError) => void;

const THROW_HANDLERS: Set<BrikaErrorThrowHandler> = new Set();

export class BrikaError<
  C extends BrikaErrorCode = BrikaErrorCode,
  D extends Record<string, unknown> | undefined = Record<string, unknown> | undefined,
> extends Error {
  /** Machine-readable error code. */
  readonly code: C;

  /**
   * Structured payload. Top-level keys are frozen at construction; nested
   * objects are NOT deep-frozen — only freeze what you mutate.
   */
  readonly data?: Readonly<D>;

  constructor(code: C, message: string, opts?: BrikaErrorOptions<D>) {
    super(message, opts?.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'BrikaError';
    this.code = code;
    if (opts?.data) {
      this.data = Object.freeze({ ...opts.data });
    }
    // Fire observability handlers. Wrapped in try/catch so a buggy handler
    // never alters the throw semantics.
    for (const handler of THROW_HANDLERS) {
      try {
        handler(this);
      } catch {
        // Intentionally swallowed — observability must not break error flow.
      }
    }
  }

  /** Serialize to a JSON-safe wire envelope. */
  toWire(opts?: { readonly includeStack?: boolean }): BrikaErrorWire {
    const seen = new WeakSet<object>();
    seen.add(this);
    return buildWire(this, opts, seen);
  }

  /**
   * Reconstruct a `BrikaError` from a wire envelope (or any value the wire
   * schema accepts).
   */
  static fromWire(wire: BrikaErrorWire): BrikaError {
    const cause = deserializeCause(wire.cause);
    const err = new BrikaError(wire.code, wire.message, {
      data: wire.data,
      cause,
    });
    if (typeof wire.stack === 'string') {
      err.stack = `${err.stack ?? ''}\n--- remote stack ---\n${wire.stack}`;
    }
    return err;
  }

  /**
   * Type guard that narrows both `code` and `data` shape via the catalog.
   *
   * Returns true when `err` is a `BrikaError` with the given code AND the
   * catalog's `data` schema accepts `err.data` (or the catalog has no data
   * schema for that code).
   */
  static is<Code extends CatalogedErrorCode>(
    err: unknown,
    code: Code
  ): err is BrikaError<Code, DataForCode<Code>> {
    if (!(err instanceof BrikaError) || err.code !== code) {
      return false;
    }
    const schema = lookupCatalogEntry(code)?.data;
    if (!schema) {
      return true;
    }
    return schema.safeParse(err.data).success;
  }

  /**
   * Register an observability handler. Called once per BrikaError
   * construction (and once per reconstruction via `fromWire`). Returns
   * a disposer.
   *
   * ```ts
   * const off = BrikaError.onThrow((err) => metrics.inc('brika.errors', { code: err.code }));
   * ```
   */
  static onThrow(handler: BrikaErrorThrowHandler): () => void {
    THROW_HANDLERS.add(handler);
    return () => {
      THROW_HANDLERS.delete(handler);
    };
  }

  /** Remove every registered onThrow handler. Useful in tests. */
  static clearThrowHandlers(): void {
    THROW_HANDLERS.clear();
  }
}

// ─── Cause helpers ─────────────────────────────────────────────────────────

/**
 * Build a wire envelope from a BrikaError instance. Threaded with a `seen`
 * WeakSet so a cause-chain cycle terminates with a `[circular cause]` frame
 * rather than blowing the stack.
 */
function buildWire(
  err: BrikaError,
  opts: { readonly includeStack?: boolean } | undefined,
  seen: WeakSet<object>
): BrikaErrorWire {
  const wire: {
    _brikaError: true;
    code: string;
    message: string;
    data?: Record<string, unknown>;
    cause?: BrikaErrorWire | { message: string; name?: string };
    stack?: string;
  } = {
    _brikaError: true,
    code: err.code,
    message: err.message,
  };
  if (err.data) {
    wire.data = { ...err.data };
  }
  const wireCause = serializeCause(err.cause, seen);
  if (wireCause !== undefined) {
    wire.cause = wireCause;
  }
  if (opts?.includeStack && typeof err.stack === 'string') {
    wire.stack = err.stack;
  }
  return wire;
}

function serializeCause(
  cause: unknown,
  seen: WeakSet<object>
): BrikaErrorWire | { message: string; name?: string } | undefined {
  if (cause === undefined || cause === null) {
    return undefined;
  }
  if (typeof cause === 'object') {
    if (seen.has(cause)) {
      return { message: '[circular cause]' };
    }
    seen.add(cause);
  }
  if (cause instanceof BrikaError) {
    return buildWire(cause, undefined, seen);
  }
  if (cause instanceof Error) {
    const frame: { message: string; name?: string } = { message: cause.message };
    if (cause.name && cause.name !== 'Error') {
      frame.name = cause.name;
    }
    return frame;
  }
  return { message: stringifyCause(cause) };
}

function stringifyCause(cause: unknown): string {
  if (typeof cause === 'string') {
    return cause;
  }
  if (typeof cause === 'object' && cause !== null) {
    try {
      return JSON.stringify(cause);
    } catch {
      return Object.prototype.toString.call(cause);
    }
  }
  return String(cause);
}

function deserializeCause(cause: BrikaErrorWire['cause']): BrikaError | Error | undefined {
  if (cause === undefined) {
    return undefined;
  }
  const nested = BrikaErrorWireSchema.safeParse(cause);
  if (nested.success) {
    return BrikaError.fromWire(nested.data);
  }
  const flat = NestedCauseSchema.safeParse(cause);
  if (flat.success) {
    const e = new Error(flat.data.message);
    if (flat.data.name) {
      e.name = flat.data.name;
    }
    return e;
  }
  return undefined;
}
