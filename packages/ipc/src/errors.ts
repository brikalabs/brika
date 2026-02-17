/**
 * IPC Error Types
 *
 * Typed errors that survive serialization across the IPC boundary.
 * When a handler throws an RpcError, the code, message, and optional
 * structured data are preserved on the wire and reconstructed on the
 * client side.
 *
 * @example Hub handler throwing a typed error:
 * ```ts
 * channel.implement(getHubLocation, () => {
 *   if (!hasPermission) {
 *     throw new RpcError('PERMISSION_DENIED', 'Location permission required', {
 *       permission: 'location',
 *     });
 *   }
 *   return { location: data };
 * });
 * ```
 *
 * @example Client catching a typed error:
 * ```ts
 * try {
 *   const result = await client.call(getHubLocation, {});
 * } catch (err) {
 *   if (err instanceof RpcError && err.code === 'PERMISSION_DENIED') {
 *     console.log(`Missing: ${err.data?.permission}`);
 *   }
 * }
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Well-Known Error Codes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard RPC error codes.
 *
 * | Code                | Meaning                                          |
 * |---------------------|--------------------------------------------------|
 * | `PERMISSION_DENIED` | Plugin lacks a required permission grant          |
 * | `NOT_FOUND`         | Requested resource does not exist                 |
 * | `INVALID_INPUT`     | Input failed validation or was malformed          |
 * | `INTERNAL`          | Unexpected server-side error                      |
 *
 * Custom codes are allowed — the union is open-ended for extensibility.
 */
export type RpcErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INTERNAL'
  // Open-ended union: custom string codes allowed, literal members provide autocomplete
  | (string & Record<never, never>);

// ─────────────────────────────────────────────────────────────────────────────
// Wire Format
// ─────────────────────────────────────────────────────────────────────────────

/** Shape of an error on the wire (JSON-serializable) */
export interface RpcErrorWire {
  readonly _rpcError: true;
  readonly code: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

/**
 * Type guard for wire-format RPC errors.
 * Used by Channel to detect typed errors in responses.
 */
export function isRpcErrorWire(value: unknown): value is RpcErrorWire {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_rpcError' in value &&
    (value as Record<string, unknown>)._rpcError === true &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RpcError Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typed RPC error that preserves its code across IPC serialization.
 *
 * Thrown by handlers to signal a specific error condition.
 * Automatically serialized on the wire and reconstructed on the client side,
 * so `instanceof RpcError` and `err.code` work in the calling process.
 *
 * @example
 * ```ts
 * // Throw with structured data
 * throw new RpcError('NOT_FOUND', 'Block not registered', { blockId: 'timer:set' });
 *
 * // Catch and inspect
 * catch (err) {
 *   if (err instanceof RpcError) {
 *     console.log(err.code);           // 'NOT_FOUND'
 *     console.log(err.data?.blockId);   // 'timer:set'
 *   }
 * }
 * ```
 */
export class RpcError extends Error {
  /** Machine-readable error code (e.g., 'PERMISSION_DENIED') */
  readonly code: RpcErrorCode;

  /**
   * Optional structured data associated with the error.
   * Preserved across the IPC boundary (must be JSON-serializable).
   */
  readonly data?: Record<string, unknown>;

  constructor(code: RpcErrorCode, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    if (data) this.data = data;
  }

  /** Serialize to wire format */
  toWire(): RpcErrorWire {
    const wire: RpcErrorWire = {
      _rpcError: true,
      code: this.code,
      message: this.message,
    };
    if (this.data) {
      (wire as { data: Record<string, unknown> }).data = this.data;
    }
    return wire;
  }

  /** Reconstruct from wire format */
  static fromWire(wire: RpcErrorWire): RpcError {
    return new RpcError(wire.code, wire.message, wire.data);
  }
}
