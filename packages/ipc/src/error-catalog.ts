/**
 * Error Catalog
 *
 * Single source of truth for every machine-readable error code thrown across
 * the platform. Each entry pins the code's HTTP status, severity, category,
 * i18n key, optional developer hint, and an optional Zod schema for its
 * structured `data` payload.
 *
 * Codes not listed here are still legal (the `BrikaErrorCode` union stays
 * open) but receive default treatment: HTTP 500, severity 'error', no i18n.
 */

import { z } from 'zod';

// ─── Severity / Category ────────────────────────────────────────────────────

export const ERROR_SEVERITIES = ['info', 'warning', 'error', 'fatal'] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_CATEGORIES = ['core', 'manifest', 'workflow'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

// ─── Catalog ────────────────────────────────────────────────────────────────

/**
 * Schemas the catalog accepts for `data`. Constrained to schemas that produce
 * an object record so {@link DataForCode} always yields a type compatible with
 * the `BrikaError` class's `D` constraint.
 */
type DataSchema = z.ZodType<Record<string, unknown>>;

/**
 * Define a catalog entry. `data` is required (pass `undefined` for codes
 * without structured payload) so the inferred `S` type parameter stays clean
 * of an `| undefined` arm — that arm was breaking `DataForCode` inference.
 */
function entry<S extends DataSchema | undefined>(e: {
  description: string;
  httpStatus: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  i18nKey?: string;
  developerHint?: string;
  data: S;
}) {
  return e;
}

export const ErrorCatalog = {
  // ─── core ──────────────────────────────────────────────────────────────
  INTERNAL: entry({
    description: 'Unexpected server-side failure.',
    httpStatus: 500,
    severity: 'error',
    category: 'core',
    i18nKey: 'errors.internal',
    developerHint: 'Check server logs for the underlying cause chain.',
    data: undefined,
  }),
  INVALID_INPUT: entry({
    description: 'Request input failed validation.',
    httpStatus: 400,
    severity: 'error',
    category: 'core',
    i18nKey: 'errors.invalid_input',
    developerHint:
      'Inspect `data.field` (when present) and the cause chain for the Zod issue list.',
    data: z.object({
      field: z.string().optional(),
    }),
  }),
  NOT_FOUND: entry({
    description: 'Requested resource does not exist.',
    httpStatus: 404,
    severity: 'error',
    category: 'core',
    i18nKey: 'errors.not_found',
    data: z.object({
      resource: z.string(),
    }),
  }),
  PERMISSION_DENIED: entry({
    description: 'A required permission was not granted.',
    httpStatus: 403,
    severity: 'error',
    category: 'core',
    i18nKey: 'errors.permission_denied',
    developerHint: 'Add the named permission to your plugin manifest and reload the plugin.',
    data: z.object({
      permission: z.string(),
    }),
  }),
  TIMEOUT: entry({
    description: 'Operation exceeded its allotted time.',
    httpStatus: 504,
    severity: 'error',
    category: 'core',
    i18nKey: 'errors.timeout',
    data: z.object({
      operation: z.string().optional(),
      timeoutMs: z.number().int().nonnegative().optional(),
    }),
  }),
  UNAVAILABLE: entry({
    description: 'A required dependency or service is unavailable.',
    httpStatus: 503,
    severity: 'error',
    category: 'core',
    i18nKey: 'errors.unavailable',
    data: undefined,
  }),

  // ─── manifest ──────────────────────────────────────────────────────────
  PLUGIN_NOT_FOUND: entry({
    description: 'Referenced plugin is not registered with the hub.',
    httpStatus: 404,
    severity: 'error',
    category: 'manifest',
    i18nKey: 'errors.plugin_not_found',
    data: z.object({
      pluginId: z.string(),
    }),
  }),
  PLUGIN_CONFIG_INVALID: entry({
    description: 'Plugin config block in brika.yml failed schema validation.',
    httpStatus: 400,
    severity: 'error',
    category: 'manifest',
    i18nKey: 'errors.plugin_config_invalid',
    developerHint: 'Check the cause chain for the underlying Zod issues.',
    data: z.object({
      pluginId: z.string(),
    }),
  }),
  MANIFEST_INVALID: entry({
    description: 'Plugin package.json failed manifest schema validation.',
    httpStatus: 400,
    severity: 'error',
    category: 'manifest',
    i18nKey: 'errors.manifest_invalid',
    developerHint: 'Check the cause chain for the underlying Zod issues.',
    data: z.object({
      manifestPath: z.string(),
    }),
  }),
  MANIFEST_MISSING_MAIN: entry({
    description: 'Plugin manifest has no resolvable entry point.',
    httpStatus: 400,
    severity: 'error',
    category: 'manifest',
    i18nKey: 'errors.manifest_missing_main',
    data: z.object({
      manifestPath: z.string(),
    }),
  }),

  // ─── workflow (diagnostic codes accumulated during validation) ─────────
  WORKFLOW_UNKNOWN_BLOCK_TYPE: entry({
    description: 'Block references a type not in the registry.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_UNKNOWN_OUTPUT_PORT: entry({
    description: 'Block declares an output port not on its type.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_UNKNOWN_INPUT_PORT: entry({
    description: 'Block declares an input port not on its type.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_UNKNOWN_TARGET_BLOCK_TYPE: entry({
    description: 'A connection target block has an unknown type.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_INVALID_PORT_REF: entry({
    description: 'Port reference string is malformed.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_TARGET_BLOCK_NOT_FOUND: entry({
    description: 'A connection target block id does not exist.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_SOURCE_BLOCK_NOT_FOUND: entry({
    description: 'A connection source block id does not exist.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_TARGET_PORT_NOT_FOUND: entry({
    description: 'Target block has no port matching the connection target.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_INVALID_CONNECTION: entry({
    description: 'Connection types are incompatible.',
    httpStatus: 400,
    severity: 'error',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_MISSING_BIDIRECTIONAL_REF: entry({
    description: 'Connection has only one side wired up.',
    httpStatus: 400,
    severity: 'warning',
    category: 'workflow',
    data: undefined,
  }),
  WORKFLOW_ORPHAN_BLOCK: entry({
    description: 'Block has input ports but no incoming connections.',
    httpStatus: 400,
    severity: 'warning',
    category: 'workflow',
    data: undefined,
  }),
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

/** Shape of a catalog row, post-erasure. */
export interface CatalogEntry {
  readonly description: string;
  readonly httpStatus: number;
  readonly severity: ErrorSeverity;
  readonly category: ErrorCategory;
  readonly i18nKey?: string;
  readonly developerHint?: string;
  readonly data?: DataSchema;
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
  return lookupCatalogEntry(code)?.httpStatus ?? 500;
}

/** Severity for a code. Defaults to 'error' so unknown codes surface loudly. */
export function severityForCode(code: string): ErrorSeverity {
  return lookupCatalogEntry(code)?.severity ?? 'error';
}
