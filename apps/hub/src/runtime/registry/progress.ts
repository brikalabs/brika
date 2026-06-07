/**
 * Helpers for building registry OperationProgress events.
 *
 * The error-bearing fields are derived once here so both the registry generator
 * (plugin-registry.ts) and the SSE route fallback (routes/registry.ts) surface
 * the SAME shape: a plain `error` string for backwards compatibility, plus the
 * additive `errorCode` / `errorDetail` when the failure was a typed BrikaError.
 */

import { BrikaError } from '@brika/errors';
import type { OperationProgress } from './types';

/** Derive {error, errorCode?, errorDetail?} from a caught value. */
export function errorFields(
  error: unknown
): Pick<OperationProgress, 'error' | 'errorCode' | 'errorDetail'> {
  if (error instanceof BrikaError) {
    return { error: error.message, errorCode: error.code, errorDetail: error.toWire() };
  }
  return { error: String(error) };
}
