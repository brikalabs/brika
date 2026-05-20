/**
 * SDK Error Types
 *
 * Typed errors plugin authors can `instanceof`-narrow on. Every class
 * extends `BrikaError` (from `@brika/ipc`), so the platform has one error
 * hierarchy end-to-end:
 *
 *   Error
 *     └─ BrikaError       (code, data, cause, wire round-trip)
 *           ├─ RpcError                    (kept for back-compat)
 *           ├─ PermissionDeniedError
 *           ├─ NotFoundError
 *           ├─ InvalidInputError
 *           ├─ InternalError
 *           └─ TimeoutError
 *
 * The SDK still re-exposes the `rpcCode` static + `fromCodedError` shim so
 * the legacy `rethrowRpcError(err)` mapping path keeps working; new code
 * should construct the typed class directly.
 *
 * @example Catching a typed denial in a plugin
 * ```ts
 * import { PermissionDeniedError } from '@brika/sdk';
 *
 * try {
 *   await ctx.location.get();
 * } catch (err) {
 *   if (err instanceof PermissionDeniedError) {
 *     console.log('not granted:', err.permission);
 *   }
 * }
 * ```
 */

import { BrikaError } from '@brika/ipc';

// ─── Coded-error duck-typing (back-compat with the legacy rethrow shim) ─────

/** Shape of an error with a machine-readable code (as thrown by IPC RpcError). */
interface CodedError extends Error {
  readonly code: string;
  readonly data?: Record<string, unknown>;
}

function isCodedError(err: unknown): err is CodedError {
  return (
    err instanceof Error &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string'
  );
}

// ─── Error Classes (all extend BrikaError) ──────────────────────────────────

/**
 * Caller lacks a required permission grant — either a legacy permission
 * family (`location`, `secrets`, …) or a reverse-DNS capability id.
 */
export class PermissionDeniedError extends BrikaError {
  static readonly rpcCode = 'PERMISSION_DENIED';
  static fromCodedError(err: CodedError): PermissionDeniedError {
    return new PermissionDeniedError(
      (err.data?.permission as string | undefined) ?? 'unknown',
      undefined,
      err
    );
  }

  readonly permission: string;

  /**
   * Three call shapes, all producing a typed BrikaError under the hood:
   *
   *   new PermissionDeniedError('secrets')
   *     -> "Permission ... package.json" hint message (legacy)
   *
   *   new PermissionDeniedError(message, capabilityId)
   *     -> uses `message` verbatim, sets `permission = capabilityId`
   *        (capability-aware: used by the ctx Proxy)
   *
   *   new PermissionDeniedError(message, capabilityId, cause)
   *     -> same as above plus an ES2022 cause chain
   */
  constructor(messageOrPermission: string, capabilityId?: string, cause?: unknown) {
    const isCapabilityForm = capabilityId !== undefined;
    const permission = isCapabilityForm ? capabilityId : messageOrPermission;
    const message = isCapabilityForm
      ? messageOrPermission
      : `Permission "${messageOrPermission}" is required but not granted. ` +
        `Add "${messageOrPermission}" to "capabilities" in your plugin's package.json.`;
    super('PERMISSION_DENIED', message, {
      data: { permission },
      cause,
    });
    this.name = 'PermissionDeniedError';
    this.permission = permission;
  }
}

/** Requested resource does not exist on the hub. */
export class NotFoundError extends BrikaError {
  static readonly rpcCode = 'NOT_FOUND';
  static fromCodedError(err: CodedError): NotFoundError {
    return new NotFoundError(
      (err.data?.resource as string | undefined) ?? 'unknown',
      err.message,
      err
    );
  }

  readonly resource: string;

  constructor(resource: string, message?: string, cause?: unknown) {
    super('NOT_FOUND', message ?? `Resource "${resource}" not found.`, {
      data: { resource },
      cause,
    });
    this.name = 'NotFoundError';
    this.resource = resource;
  }
}

/** Input value failed validation. The `field` carries the failing path. */
export class InvalidInputError extends BrikaError {
  static readonly rpcCode = 'INVALID_INPUT';
  static fromCodedError(err: CodedError): InvalidInputError {
    return new InvalidInputError(
      err.message,
      (err.data?.field as string | undefined) ?? undefined,
      err
    );
  }

  readonly field?: string;

  constructor(message: string, field?: string, cause?: unknown) {
    super(
      'INVALID_INPUT',
      field ? `Invalid input for "${field}": ${message}` : message,
      { data: field === undefined ? undefined : { field }, cause }
    );
    this.name = 'InvalidInputError';
    this.field = field;
  }
}

/** Unexpected internal error. Use sparingly — prefer a specific code. */
export class InternalError extends BrikaError {
  static readonly rpcCode = 'INTERNAL';
  static fromCodedError(err: CodedError): InternalError {
    return new InternalError(err.message, err);
  }

  constructor(message?: string, cause?: unknown) {
    super('INTERNAL', message ?? 'An internal error occurred.', { cause });
    this.name = 'InternalError';
  }
}

/** Operation exceeded its deadline. */
export class TimeoutError extends BrikaError {
  static readonly rpcCode = 'TIMEOUT';
  static fromCodedError(err: CodedError): TimeoutError {
    return new TimeoutError(
      err.message,
      (err.data?.timeoutMs as number | undefined) ?? undefined,
      err
    );
  }

  readonly timeoutMs?: number;

  constructor(message: string, timeoutMs?: number, cause?: unknown) {
    super('TIMEOUT', message, {
      data: timeoutMs === undefined ? undefined : { timeoutMs },
      cause,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// ─── Error Mapping (legacy rethrow path) ─────────────────────────────────────

interface MappedSdkError {
  readonly rpcCode: string;
  fromCodedError(err: CodedError): Error;
}

/** All SDK error classes that map from RPC codes. */
export const sdkErrors: MappedSdkError[] = [
  PermissionDeniedError,
  NotFoundError,
  InvalidInputError,
  InternalError,
  TimeoutError,
];

/**
 * Map an error with a `code` field to the matching SDK error class, or
 * rethrow as-is. Use as a `.catch()` handler:
 *
 *   const result = await bridge.getLocation().catch(rethrowRpcError);
 *
 * After Phase 1 the IPC channel reconstructs `RpcError` instances on the
 * client side automatically, so most callers never need this — it's
 * retained for ad-hoc catch-by-string-code paths.
 */
export function rethrowRpcError(err: unknown): never {
  if (isCodedError(err)) {
    const cls = sdkErrors.find((c) => c.rpcCode === err.code);
    if (cls) {
      throw cls.fromCodedError(err);
    }
  }
  throw err;
}

// Re-export BrikaError so plugin authors get the base class from the SDK
// without a separate `@brika/ipc` import.
export { BrikaError } from '@brika/ipc';
export type { BrikaErrorCode, BrikaErrorWire } from '@brika/ipc';
