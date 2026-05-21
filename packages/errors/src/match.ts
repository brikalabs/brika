/**
 * Type-safe `match` helper for narrowing a thrown value against the catalog.
 *
 * ```ts
 * const view = matchBrikaError(err, {
 *   PERMISSION_DENIED: ({ permission }) => `Missing: ${permission}`,
 *   NOT_FOUND: ({ resource }) => `Gone: ${resource}`,
 *   TIMEOUT: ({ operation, timeoutMs }) => `Timeout: ${operation} (${timeoutMs}ms)`,
 *   _: () => 'Something went wrong',
 * });
 * ```
 *
 * Each handler is typed against the catalog's data shape for that code.
 * The `_` arm is the catch-all and is REQUIRED so unknown / uncataloged
 * errors are always handled.
 */

import type { CatalogedErrorCode, DataForCode } from './catalog';
import { BrikaError } from './error';

/**
 * Handler signature for a given cataloged code. Extracted via indexed access
 * from a method form so its parameter types are bivariant — heterogeneous
 * per-code handlers widen to a uniform dispatch signature without an `as`
 * cast. (Function-type aliases would be contravariant under strict mode.)
 */
export type Handler<C extends CatalogedErrorCode, R> = {
  handle(data: DataForCode<C>, err: BrikaError<C, DataForCode<C>>): R;
}['handle'];

/** Per-code handler map, with a required `_` catch-all. */
export type MatchHandlers<R> = {
  readonly [C in CatalogedErrorCode]?: Handler<C, R>;
} & {
  /** Catch-all for uncataloged codes, plain Errors, and non-Error values. */
  readonly _: (err: unknown) => R;
};

/**
 * Walk a thrown value against per-code handlers. Returns the handler's
 * result. The `_` arm fires for:
 * - non-BrikaError throws (plain Error, primitives, etc.)
 * - BrikaError with a code not in the handler map
 * - BrikaError with a code outside the catalog
 */
export function matchBrikaError<R>(err: unknown, handlers: MatchHandlers<R>): R {
  if (!(err instanceof BrikaError)) {
    return handlers._(err);
  }
  const handler = pickHandler(err.code, handlers);
  if (!handler) {
    return handlers._(err);
  }
  return handler(err.data, err);
}

/**
 * Resolve a per-code handler from the dispatch map. At runtime the matching
 * BrikaError instance carries exactly the data shape the handler expects,
 * but TypeScript cannot prove that across the heterogeneous map — hence the
 * single, well-scoped widening of the value's parameter type to `unknown`.
 */
function pickHandler<R>(
  code: string,
  handlers: MatchHandlers<R>
): ((data: unknown, err: BrikaError) => R) | undefined {
  if (code === '_' || !Object.hasOwn(handlers, code)) {
    return undefined;
  }
  const raw: unknown = Reflect.get(handlers, code);
  if (typeof raw !== 'function') {
    return undefined;
  }
  const fn = raw;
  return (data, err) => Reflect.apply(fn, undefined, [data, err]) as R;
}
