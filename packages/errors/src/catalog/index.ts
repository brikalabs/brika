/**
 * Error catalog — single source of truth for every machine-readable
 * error code thrown across the platform. Each entry pins:
 *
 * - `title` / `description` — human framing (RFC 7807 `title`)
 * - `typeUri` — stable URI identifying the problem class (RFC 7807 `type`)
 * - `status` — HTTP status the response uses
 * - `severity` / `category` — operational metadata
 * - `retryable` — should the client retry this without changing inputs?
 * - `transient` — is the underlying condition expected to clear with time?
 * - `i18nKey` — FE translation lookup
 * - `developerHint` — actionable advice surfaced in dev tools
 * - `data` — optional Zod schema for the typed payload
 * - `message(data)` — default English message builder (also the fallback for
 *   locales that haven't translated `i18nKey`)
 *
 * Codes not listed here are still legal (the `BrikaErrorCode` union stays
 * open) but receive default treatment: HTTP 500, severity 'error',
 * retryable: false, no i18n.
 *
 * The catalog is split per-family across sibling files (core, manifest,
 * workflow, grants, net, fs, ws); this index merges them so the rest of
 * the package keeps a single `ErrorCatalog` import.
 */

import type { z } from 'zod';
import type { DataSchema, ErrorCategory, ErrorSeverity } from './_entry';
import { CoreCatalog } from './core';
import { FsCatalog } from './fs';
import { GrantsCatalog } from './grants';
import { ManifestCatalog } from './manifest';
import { NetCatalog } from './net';
import { WorkflowCatalog } from './workflow';
import { WsCatalog } from './ws';

export {
  ERROR_CATEGORIES,
  ERROR_SEVERITIES,
  type ErrorCategory,
  type ErrorSeverity,
} from './_entry';

export const ErrorCatalog = {
  ...CoreCatalog,
  ...ManifestCatalog,
  ...WorkflowCatalog,
  ...GrantsCatalog,
  ...NetCatalog,
  ...FsCatalog,
  ...WsCatalog,
} as const;

// ─── Derived types ──────────────────────────────────────────────────────────

/** Codes guaranteed to be present in the catalog. */
export type CatalogedErrorCode = keyof typeof ErrorCatalog;

/**
 * Any code the platform may emit. Cataloged codes provide autocomplete and
 * data-shape narrowing; the open-ended `string` arm lets plugin-defined or
 * future codes type-check.
 */
export type BrikaErrorCode = CatalogedErrorCode | (string & Record<never, never>);

/**
 * Shape of a catalog row, post-erasure. `message` uses method syntax so
 * narrower-typed entries (e.g. `(data: {permission: string}) => string`)
 * remain assignable when widened via {@link lookupCatalogEntry}.
 */
export interface CatalogEntry {
  readonly title: string;
  readonly description: string;
  readonly typeUri: string;
  readonly status: number;
  readonly severity: ErrorSeverity;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly transient: boolean;
  readonly i18nKey?: string;
  readonly developerHint?: string;
  readonly data?: DataSchema;
  /** See `entry({ publicDataShape })` — redaction schema for cross-boundary wire payloads. */
  readonly publicDataShape?: DataSchema;
  message(data: Record<string, unknown> | undefined): string;
}

/**
 * Infer the `data` payload shape for a cataloged code. Codes without a `data`
 * schema resolve to `undefined`. Uncataloged codes fall back to a permissive
 * record (the caller has no schema to narrow against).
 */
export type DataForCode<C> = C extends CatalogedErrorCode
  ? (typeof ErrorCatalog)[C]['data'] extends DataSchema
    ? z.infer<(typeof ErrorCatalog)[C]['data']>
    : undefined
  : Record<string, unknown> | undefined;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Typed index over the catalog. Widens the per-entry literal types down to
 * the `CatalogEntry` shape so lookups by arbitrary string keys typecheck
 * without `as` casts.
 */
const CATALOG_INDEX: Readonly<Record<string, CatalogEntry>> = ErrorCatalog;

/** Look up a catalog entry. Returns undefined for unknown codes. */
export function lookupCatalogEntry(code: string): CatalogEntry | undefined {
  return CATALOG_INDEX[code];
}

/** HTTP status for a code. Defaults to 500. */
export function httpStatusForCode(code: string): number {
  return lookupCatalogEntry(code)?.status ?? 500;
}

/** Severity for a code. Defaults to 'error' so unknown codes surface loudly. */
export function severityForCode(code: string): ErrorSeverity {
  return lookupCatalogEntry(code)?.severity ?? 'error';
}

/** Whether a code should be retried. Defaults to false (safer). */
export function isRetryable(code: string): boolean {
  return lookupCatalogEntry(code)?.retryable ?? false;
}
