/**
 * SDK Error Types
 *
 * Typed error classes that map from IPC `RpcError` codes.
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

import { RpcError } from '@brika/ipc';

// ─── Error Classes ──────────────────────────────────────────────────────────

export class PermissionDeniedError extends Error {
  static readonly rpcCode = 'PERMISSION_DENIED';
  static fromRpcError(err: RpcError) {
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
  static fromRpcError(err: RpcError) {
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
  static fromRpcError(err: RpcError) {
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
  static fromRpcError(err: RpcError) {
    return new InternalError(err.message);
  }

  constructor(message?: string) {
    super(message ?? 'An internal error occurred.');
    this.name = 'InternalError';
  }
}

// ─── RPC Error Mapping ──────────────────────────────────────────────────────

export interface MappedSdkError {
  readonly rpcCode: string;
  fromRpcError(err: RpcError): Error;
}

/** All SDK error classes that map from RPC codes. */
export const sdkErrors: MappedSdkError[] = [
  PermissionDeniedError,
  NotFoundError,
  InvalidInputError,
  InternalError,
];

/**
 * Map an `RpcError` to the matching SDK error class, or rethrow as-is.
 *
 * Use as a `.catch()` handler:
 * ```ts
 * const result = await client.call(someRpc, {}).catch(rethrowRpcError);
 * ```
 */
export function rethrowRpcError(err: unknown): never {
  if (err instanceof RpcError) {
    const cls = sdkErrors.find((c) => c.rpcCode === err.code);
    if (cls) {
      throw cls.fromRpcError(err);
    }
  }
  throw err;
}
