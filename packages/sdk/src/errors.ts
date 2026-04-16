/**
 * SDK Error Types
 *
 * Typed error classes that map from RPC error codes.
 * Uses duck-typing on the error shape (code + data fields) so the SDK
 * does not depend on @brika/ipc's RpcError class.
 *
 * @example Catching SDK errors in a plugin
 * ```typescript
 * import { PermissionDeniedError } from '@brika/sdk';
 *
 * try {
 *   const loc = await ctx.getLocation();
 * } catch (err) {
 *   if (err instanceof PermissionDeniedError) {
 *     console.log(`Missing permission: ${err.permission}`);
 *   }
 * }
 * ```
 */

// ─── RPC-like error shape ──────────────────────────────────────────────────

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

// ─── Error Classes ──────────────────────────────────────────────────────────

export class PermissionDeniedError extends Error {
  static readonly rpcCode = 'PERMISSION_DENIED';
  static fromCodedError(err: CodedError) {
    return new PermissionDeniedError((err.data?.permission as string) ?? 'unknown');
  }

  readonly permission: string;

  constructor(permission: string) {
    super(
      `Permission "${permission}" is required but not granted. ` +
        `Add "${permission}" to "permissions" in your plugin's package.json.`
    );
    this.name = 'PermissionDeniedError';
    this.permission = permission;
  }
}

export class NotFoundError extends Error {
  static readonly rpcCode = 'NOT_FOUND';
  static fromCodedError(err: CodedError) {
    return new NotFoundError((err.data?.resource as string) ?? 'unknown', err.message);
  }

  readonly resource: string;

  constructor(resource: string, message?: string) {
    super(message ?? `Resource "${resource}" not found.`);
    this.name = 'NotFoundError';
    this.resource = resource;
  }
}

export class InvalidInputError extends Error {
  static readonly rpcCode = 'INVALID_INPUT';
  static fromCodedError(err: CodedError) {
    return new InvalidInputError(err.message, (err.data?.field as string) ?? undefined);
  }

  /** The specific field that failed validation, if available */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(field ? `Invalid input for "${field}": ${message}` : message);
    this.name = 'InvalidInputError';
    this.field = field;
  }
}

export class InternalError extends Error {
  static readonly rpcCode = 'INTERNAL';
  static fromCodedError(err: CodedError) {
    return new InternalError(err.message);
  }

  constructor(message?: string) {
    super(message ?? 'An internal error occurred.');
    this.name = 'InternalError';
  }
}

// ─── Error Mapping ─────────────────────────────────────────────────────────

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
];

/**
 * Map an error with a `code` field to the matching SDK error class, or rethrow as-is.
 *
 * Use as a `.catch()` handler:
 * ```ts
 * const result = await bridge.getLocation().catch(rethrowRpcError);
 * ```
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
