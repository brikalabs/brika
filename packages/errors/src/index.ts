/**
 * @brika/errors — Typed error catalog, factories, match helper, and RFC 9457
 * envelope for the Brika platform.
 *
 * @example throw a typed error:
 * ```ts
 * import { errors } from '@brika/errors';
 * throw errors.permissionDenied({ permission: 'location' });
 * ```
 *
 * @example narrow a caught error:
 * ```ts
 * import { BrikaError, matchBrikaError } from '@brika/errors';
 *
 * if (BrikaError.is(err, 'PERMISSION_DENIED')) {
 *   console.log(err.data?.permission);
 * }
 *
 * matchBrikaError(err, {
 *   PERMISSION_DENIED: ({ permission }) => `Missing: ${permission}`,
 *   TIMEOUT: ({ operation, timeoutMs }) => `Timeout: ${operation}/${timeoutMs}ms`,
 *   _: () => 'unknown',
 * });
 * ```
 *
 * @see https://www.rfc-editor.org/rfc/rfc9457 — HTTP envelope spec
 */

// ─── Catalog ───
export type {
  BrikaErrorCode,
  CatalogEntry,
  CatalogedErrorCode,
  DataForCode,
  ErrorCategory,
  ErrorSeverity,
} from './catalog';
export {
  ERROR_CATEGORIES,
  ERROR_SEVERITIES,
  ErrorCatalog,
  httpStatusForCode,
  isRetryable,
  lookupCatalogEntry,
  severityForCode,
} from './catalog';

// ─── Class + wire ───
export type { BrikaErrorThrowHandler, BrikaErrorWire } from './error';
export { BrikaError, BrikaErrorWireSchema, isBrikaErrorWire } from './error';

// ─── Factories ───
export type { FactoryOpts } from './factories';
export { buildCustomError, buildError, errors } from './factories';
// ─── HTTP boundary (RFC 9457) ───
export type { BrikaErrorResponseBody, ResponseOptions } from './http';
export { brikaErrorToResponse } from './http';
// ─── Match ───
export type { Handler, MatchHandlers } from './match';
export { matchBrikaError } from './match';
