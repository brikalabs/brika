/**
 * Shared types + helpers used by every per-family catalog file.
 *
 * Underscore prefix marks the file as catalog-internal: consumers
 * import from `../catalog` (the index), not from here. Splitting the
 * entry helper out keeps each family file focused on its own codes
 * without re-declaring the row shape.
 */

import type { z } from 'zod';

export const ERROR_SEVERITIES = ['info', 'warning', 'error', 'fatal'] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_CATEGORIES = ['core', 'manifest', 'workflow', 'grants'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/** URI prefix every catalogued `typeUri` is built from. */
export const TYPE_BASE = 'https://brika.dev/errors/';

/**
 * Schemas the catalog accepts for `data`. Constrained to schemas that produce
 * an object record so {@link DataForCode} always yields a type compatible with
 * the `BrikaError` class's `D` constraint.
 */
export type DataSchema = z.ZodType<Record<string, unknown>>;

/**
 * Define a catalog entry. `data` is required (pass `undefined` for codes
 * without structured payload) so the inferred `S` type parameter stays clean
 * of an `| undefined` arm — that arm was breaking `DataForCode` inference.
 *
 * `message` receives the validated `data` shape (or undefined) and returns
 * the default English string. Locales override per language via i18nKey.
 */
export function entry<S extends DataSchema | undefined>(e: {
  title: string;
  description: string;
  typeUri: string;
  status: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryable: boolean;
  transient: boolean;
  i18nKey?: string;
  developerHint?: string;
  data: S;
  /**
   * Schema describing the subset of `data` that's safe to expose across
   * trust boundaries (IPC → plugin, HTTP → API consumer). When set,
   * `BrikaError.toWire()` parses the full data through this schema and
   * emits only the parsed result; the original `data` stays in
   * hub-side logs.
   *
   * Used to hide hub state from a compromised plugin — e.g.
   * `NET_HOST_NOT_ALLOWED` keeps `host` public but redacts the operator's
   * full allow-list, so a denied call doesn't leak system config.
   *
   * Omit when the entire `data` payload is already plugin-safe.
   */
  publicDataShape?: DataSchema;
  message: (data: S extends DataSchema ? z.infer<S> : undefined) => string;
}) {
  return e;
}
