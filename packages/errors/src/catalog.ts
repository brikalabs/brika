/**
 * Error Catalog
 *
 * Single source of truth for every machine-readable error code thrown across
 * the platform. Each entry pins:
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
 */

import { z } from 'zod';

// ─── Severity / Category ────────────────────────────────────────────────────

export const ERROR_SEVERITIES = ['info', 'warning', 'error', 'fatal'] as const;
export type ErrorSeverity = (typeof ERROR_SEVERITIES)[number];

export const ERROR_CATEGORIES = ['core', 'manifest', 'workflow'] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const TYPE_BASE = 'https://brika.dev/errors/';

// ─── Catalog row helper ─────────────────────────────────────────────────────

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
 *
 * `message` receives the validated `data` shape (or undefined) and returns
 * the default English string. Locales override per language via i18nKey.
 */
function entry<S extends DataSchema | undefined>(e: {
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
  message: (data: S extends DataSchema ? z.infer<S> : undefined) => string;
}) {
  return e;
}

// ─── Catalog ────────────────────────────────────────────────────────────────

export const ErrorCatalog = {
  // ─── core ──────────────────────────────────────────────────────────────
  INTERNAL: entry({
    title: 'Internal error',
    description: 'Unexpected server-side failure.',
    typeUri: `${TYPE_BASE}internal`,
    status: 500,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: true,
    i18nKey: 'errors:internal',
    developerHint: 'Check server logs for the underlying cause chain.',
    data: undefined,
    message: () => 'An internal error occurred.',
  }),
  INVALID_INPUT: entry({
    title: 'Invalid input',
    description: 'Request input failed validation.',
    typeUri: `${TYPE_BASE}invalid-input`,
    status: 400,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: false,
    i18nKey: 'errors:invalid_input',
    developerHint:
      'Inspect `data.field` (when present) and the cause chain for the Zod issue list.',
    data: z.object({
      field: z.string().optional(),
    }),
    message: (data) => (data.field ? `Invalid input for "${data.field}"` : 'Invalid input.'),
  }),
  NOT_FOUND: entry({
    title: 'Not found',
    description: 'Requested resource does not exist.',
    typeUri: `${TYPE_BASE}not-found`,
    status: 404,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: false,
    i18nKey: 'errors:not_found',
    data: z.object({
      resource: z.string(),
    }),
    message: (data) => `Resource "${data.resource}" not found.`,
  }),
  PERMISSION_DENIED: entry({
    title: 'Permission denied',
    description: 'A required permission was not granted.',
    typeUri: `${TYPE_BASE}permission-denied`,
    status: 403,
    severity: 'error',
    category: 'core',
    retryable: false,
    transient: false,
    i18nKey: 'errors:permission_denied',
    developerHint: 'Add the named permission to your plugin manifest and reload the plugin.',
    data: z.object({
      permission: z.string(),
    }),
    message: (data) =>
      `Permission "${data.permission}" is required but not granted. ` +
      `Add "${data.permission}" to "permissions" in your plugin's package.json.`,
  }),
  TIMEOUT: entry({
    title: 'Timeout',
    description: 'Operation exceeded its allotted time.',
    typeUri: `${TYPE_BASE}timeout`,
    status: 504,
    severity: 'error',
    category: 'core',
    retryable: true,
    transient: true,
    i18nKey: 'errors:timeout',
    data: z.object({
      operation: z.string().optional(),
      timeoutMs: z.number().int().nonnegative().optional(),
    }),
    message: (data) => formatTimeoutMessage(data),
  }),
  UNAVAILABLE: entry({
    title: 'Service unavailable',
    description: 'A required dependency or service is unavailable.',
    typeUri: `${TYPE_BASE}unavailable`,
    status: 503,
    severity: 'error',
    category: 'core',
    retryable: true,
    transient: true,
    i18nKey: 'errors:unavailable',
    data: undefined,
    message: () => 'A required service is unavailable.',
  }),

  // ─── manifest ──────────────────────────────────────────────────────────
  PLUGIN_NOT_FOUND: entry({
    title: 'Plugin not found',
    description: 'Referenced plugin is not registered with the hub.',
    typeUri: `${TYPE_BASE}plugin-not-found`,
    status: 404,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:plugin_not_found',
    data: z.object({
      pluginId: z.string(),
    }),
    message: (data) => `Plugin not found: ${data.pluginId}`,
  }),
  PLUGIN_CONFIG_INVALID: entry({
    title: 'Plugin config invalid',
    description: 'Plugin config block in brika.yml failed schema validation.',
    typeUri: `${TYPE_BASE}plugin-config-invalid`,
    status: 400,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:plugin_config_invalid',
    developerHint: 'Check the cause chain for the underlying Zod issues.',
    data: z.object({
      pluginId: z.string(),
    }),
    message: (data) => `Plugin "${data.pluginId}" has invalid configuration.`,
  }),
  MANIFEST_INVALID: entry({
    title: 'Manifest invalid',
    description: 'Plugin package.json failed manifest schema validation.',
    typeUri: `${TYPE_BASE}manifest-invalid`,
    status: 400,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:manifest_invalid',
    developerHint: 'Check the cause chain for the underlying Zod issues.',
    data: z.object({
      manifestPath: z.string(),
    }),
    message: (data) => `Plugin manifest is invalid: ${data.manifestPath}`,
  }),
  MANIFEST_MISSING_MAIN: entry({
    title: 'Manifest missing entry point',
    description: 'Plugin manifest has no resolvable entry point.',
    typeUri: `${TYPE_BASE}manifest-missing-main`,
    status: 400,
    severity: 'error',
    category: 'manifest',
    retryable: false,
    transient: false,
    i18nKey: 'errors:manifest_missing_main',
    data: z.object({
      manifestPath: z.string(),
    }),
    message: (data) => `Plugin manifest at "${data.manifestPath}" has no "main" entry point.`,
  }),

  // ─── workflow (diagnostic codes; never thrown — catalog provides severity only) ─────────
  WORKFLOW_UNKNOWN_BLOCK_TYPE: entry({
    title: 'Unknown block type',
    description: 'Block references a type not in the registry.',
    typeUri: `${TYPE_BASE}workflow/unknown-block-type`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Unknown block type.',
  }),
  WORKFLOW_UNKNOWN_OUTPUT_PORT: entry({
    title: 'Unknown output port',
    description: 'Block declares an output port not on its type.',
    typeUri: `${TYPE_BASE}workflow/unknown-output-port`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Unknown output port.',
  }),
  WORKFLOW_UNKNOWN_INPUT_PORT: entry({
    title: 'Unknown input port',
    description: 'Block declares an input port not on its type.',
    typeUri: `${TYPE_BASE}workflow/unknown-input-port`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Unknown input port.',
  }),
  WORKFLOW_UNKNOWN_TARGET_BLOCK_TYPE: entry({
    title: 'Unknown target block type',
    description: 'A connection target block has an unknown type.',
    typeUri: `${TYPE_BASE}workflow/unknown-target-block-type`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Unknown target block type.',
  }),
  WORKFLOW_INVALID_PORT_REF: entry({
    title: 'Invalid port reference',
    description: 'Port reference string is malformed.',
    typeUri: `${TYPE_BASE}workflow/invalid-port-ref`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Invalid port reference.',
  }),
  WORKFLOW_TARGET_BLOCK_NOT_FOUND: entry({
    title: 'Target block not found',
    description: 'A connection target block id does not exist.',
    typeUri: `${TYPE_BASE}workflow/target-block-not-found`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Target block not found.',
  }),
  WORKFLOW_SOURCE_BLOCK_NOT_FOUND: entry({
    title: 'Source block not found',
    description: 'A connection source block id does not exist.',
    typeUri: `${TYPE_BASE}workflow/source-block-not-found`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Source block not found.',
  }),
  WORKFLOW_TARGET_PORT_NOT_FOUND: entry({
    title: 'Target port not found',
    description: 'Target block has no port matching the connection target.',
    typeUri: `${TYPE_BASE}workflow/target-port-not-found`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Target port not found.',
  }),
  WORKFLOW_INVALID_CONNECTION: entry({
    title: 'Invalid connection',
    description: 'Connection types are incompatible.',
    typeUri: `${TYPE_BASE}workflow/invalid-connection`,
    status: 400,
    severity: 'error',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Invalid connection.',
  }),
  WORKFLOW_MISSING_BIDIRECTIONAL_REF: entry({
    title: 'Missing bidirectional reference',
    description: 'Connection has only one side wired up.',
    typeUri: `${TYPE_BASE}workflow/missing-bidirectional-ref`,
    status: 400,
    severity: 'warning',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Connection is missing the bidirectional reference.',
  }),
  WORKFLOW_ORPHAN_BLOCK: entry({
    title: 'Orphan block',
    description: 'Block has input ports but no incoming connections.',
    typeUri: `${TYPE_BASE}workflow/orphan-block`,
    status: 400,
    severity: 'warning',
    category: 'workflow',
    retryable: false,
    transient: false,
    data: undefined,
    message: () => 'Block has input ports but no incoming connections.',
  }),
} as const;

function formatTimeoutMessage(data: {
  readonly operation?: string;
  readonly timeoutMs?: number;
}): string {
  if (data.operation && typeof data.timeoutMs === 'number') {
    return `Operation "${data.operation}" timed out after ${data.timeoutMs}ms.`;
  }
  if (data.operation) {
    return `Operation "${data.operation}" timed out.`;
  }
  if (typeof data.timeoutMs === 'number') {
    return `Operation timed out after ${data.timeoutMs}ms.`;
  }
  return 'Operation timed out.';
}

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
