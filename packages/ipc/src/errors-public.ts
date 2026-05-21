/**
 * `@brika/ipc/errors` — error-system surface that does NOT pull the
 * channel/host/client runtime into the import graph. Consume this from
 * browser/non-Bun packages that only need the BrikaError class, catalog
 * helpers, and types.
 */

export type {
  BrikaErrorCode,
  CatalogEntry,
  CatalogedErrorCode,
  DataForCode,
  ErrorCategory,
  ErrorSeverity,
} from './error-catalog';
export {
  ErrorCatalog,
  httpStatusForCode,
  isRetryable,
  lookupCatalogEntry,
  severityForCode,
} from './error-catalog';
export type { BrikaErrorResponseBody, BrikaErrorWire } from './errors';
export {
  BrikaError,
  BrikaErrorWireSchema,
  brikaErrorToResponse,
  isBrikaErrorWire,
} from './errors';
export type { FactoryOpts } from './factories';
export { buildCustomError, buildError, errors } from './factories';
export type { Handler, MatchHandlers } from './match';
export { matchBrikaError } from './match';
