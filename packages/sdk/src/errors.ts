/**
 * SDK error classes — typed convenience constructors that extend
 * {@link BrikaError}.
 *
 * Throwing one of these from a hub handler or plugin route emits a typed
 * error envelope on the wire. On the receiving side, the channel reconstructs
 * a `BrikaError` (the class identity does not cross the boundary). Callers
 * narrow with `BrikaError.is(err, 'CODE')`:
 *
 * ```ts
 * import { BrikaError } from '@brika/sdk';
 *
 * try {
 *   const loc = await ctx.getLocation();
 * } catch (err) {
 *   if (BrikaError.is(err, 'PERMISSION_DENIED')) {
 *     console.log(err.data?.permission); // typed via the catalog schema
 *   }
 * }
 * ```
 */

import { BrikaError } from '@brika/ipc';

export class PermissionDeniedError extends BrikaError<'PERMISSION_DENIED', { permission: string }> {
  constructor(permission: string) {
    super(
      'PERMISSION_DENIED',
      `Permission "${permission}" is required but not granted. Add "${permission}" to "permissions" in your plugin's package.json.`,
      { data: { permission } }
    );
    this.name = 'PermissionDeniedError';
  }

  /** Derived from `data.permission` — single source of truth lives on the wire payload. */
  get permission(): string {
    return this.data?.permission ?? 'unknown';
  }
}

export class NotFoundError extends BrikaError<'NOT_FOUND', { resource: string }> {
  constructor(resource: string, message?: string) {
    super('NOT_FOUND', message ?? `Resource "${resource}" not found.`, {
      data: { resource },
    });
    this.name = 'NotFoundError';
  }

  get resource(): string {
    return this.data?.resource ?? 'unknown';
  }
}

export class InvalidInputError extends BrikaError<'INVALID_INPUT', { field?: string }> {
  constructor(message: string, field?: string) {
    super('INVALID_INPUT', field ? `Invalid input for "${field}": ${message}` : message, {
      data: field ? { field } : undefined,
    });
    this.name = 'InvalidInputError';
  }

  get field(): string | undefined {
    return this.data?.field;
  }
}

export class InternalError extends BrikaError<'INTERNAL'> {
  constructor(message?: string, cause?: unknown) {
    super('INTERNAL', message ?? 'An internal error occurred.', { cause });
    this.name = 'InternalError';
  }
}

export class TimeoutError extends BrikaError<
  'TIMEOUT',
  { operation?: string; timeoutMs?: number }
> {
  constructor(opts: { operation?: string; timeoutMs?: number; message?: string } = {}) {
    const data: { operation?: string; timeoutMs?: number } = {};
    if (opts.operation) {
      data.operation = opts.operation;
    }
    if (typeof opts.timeoutMs === 'number') {
      data.timeoutMs = opts.timeoutMs;
    }
    super('TIMEOUT', opts.message ?? formatTimeoutMessage(opts), {
      data: Object.keys(data).length > 0 ? data : undefined,
    });
    this.name = 'TimeoutError';
  }

  get operation(): string | undefined {
    return this.data?.operation;
  }

  get timeoutMs(): number | undefined {
    return this.data?.timeoutMs;
  }
}

function formatTimeoutMessage(opts: { operation?: string; timeoutMs?: number }): string {
  if (opts.operation && typeof opts.timeoutMs === 'number') {
    return `Operation "${opts.operation}" timed out after ${opts.timeoutMs}ms.`;
  }
  if (opts.operation) {
    return `Operation "${opts.operation}" timed out.`;
  }
  if (typeof opts.timeoutMs === 'number') {
    return `Operation timed out after ${opts.timeoutMs}ms.`;
  }
  return 'Operation timed out.';
}
