/**
 * Error code catalog.
 *
 * Every machine-readable error code the platform emits is documented here.
 * One source of truth across IPC errors (thrown as `BrikaError`) and
 * domain-specific diagnostic codes (workflow validation, etc.).
 *
 * Each entry carries:
 *   - `description`     short human-readable explanation
 *   - `httpStatus`      canonical HTTP status when surfaced through a route
 *   - `severity`        for log/UI styling (`info | warning | error | fatal`)
 *   - `developerHint`   what the developer should do about this
 *   - `i18nKey`         optional translation key for end-user display
 *   - `data`            optional Zod schema describing the `data` dict shape
 *   - `category`        one of `core | network | fs | exec | secrets | workflow | manifest`
 *
 * The exported `BrikaErrorCode` type is derived from this catalog — adding a
 * new code is a one-line edit here, and trying to throw an undocumented
 * code is a TypeScript error.
 */

import { z } from 'zod';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';
export type ErrorCategory =
  | 'core'
  | 'network'
  | 'fs'
  | 'exec'
  | 'secrets'
  | 'workflow'
  | 'manifest';

export interface CatalogEntry {
  readonly description: string;
  readonly httpStatus: number;
  readonly severity: ErrorSeverity;
  readonly category: ErrorCategory;
  readonly developerHint?: string;
  readonly i18nKey?: string;
  /** Optional Zod schema for `BrikaError.data` when this code is thrown. */
  readonly data?: z.ZodType;
}

/**
 * The catalog.
 *
 * Order: core codes first, then by category. Each block is sorted
 * alphabetically inside the category.
 */
export const ErrorCatalog = {
  // ─── Core (every code below is thrown as BrikaError somewhere) ────────────

  INTERNAL: {
    description: 'Unexpected internal error.',
    httpStatus: 500,
    severity: 'error',
    category: 'core',
    developerHint:
      'Inspect `.cause` for the original throw. If reproducible, file a bug with the cause stack.',
    i18nKey: 'errors.internal',
  },

  INVALID_INPUT: {
    description: 'Input value failed Zod validation.',
    httpStatus: 400,
    severity: 'error',
    category: 'core',
    developerHint:
      'Compare the offending value against the spec\'s `args` schema. The `data.field` carries the failing path.',
    i18nKey: 'errors.invalid_input',
    data: z.object({ field: z.string().optional() }).passthrough(),
  },

  INVALID_OUTPUT: {
    description: 'Handler returned a value that failed Zod validation.',
    httpStatus: 500,
    severity: 'error',
    category: 'core',
    developerHint:
      'Handler bug. The return value must match the capability spec\'s `result` schema.',
    i18nKey: 'errors.invalid_output',
  },

  NOT_FOUND: {
    description: 'Requested resource does not exist.',
    httpStatus: 404,
    severity: 'warning',
    category: 'core',
    i18nKey: 'errors.not_found',
    data: z.object({ resource: z.string() }).passthrough(),
  },

  PERMISSION_DENIED: {
    description: 'Caller lacks a required permission or capability grant.',
    httpStatus: 403,
    severity: 'error',
    category: 'core',
    developerHint:
      'Declare the capability in the plugin manifest and ensure the user has granted it via the UI.',
    i18nKey: 'errors.permission_denied',
    data: z.object({ permission: z.string() }).passthrough(),
  },

  TIMEOUT: {
    description: 'Operation exceeded its deadline.',
    httpStatus: 504,
    severity: 'warning',
    category: 'core',
    developerHint:
      'Raise `timeoutMs` on the call site, or check whether the upstream service is healthy.',
    i18nKey: 'errors.timeout',
    data: z.object({ timeoutMs: z.number() }).passthrough(),
  },

  UNAVAILABLE: {
    description:
      'A dependency (network, filesystem, registry, downstream service) is unavailable.',
    httpStatus: 503,
    severity: 'error',
    category: 'core',
    developerHint:
      'Inspect `.cause`. Retries (with backoff) are appropriate for transient failures.',
    i18nKey: 'errors.unavailable',
  },

  // ─── Capability registry (thrown by @brika/capabilities) ──────────────────

  NOT_REGISTERED: {
    description: 'Dispatched against a capability id the hub has not registered.',
    httpStatus: 404,
    severity: 'error',
    category: 'core',
    developerHint:
      'Either a typo in the manifest, a plugin built against an older SDK, or the hub is missing a capability handler.',
    data: z.object({ capabilityId: z.string() }).passthrough(),
  },

  NOT_GRANTED: {
    description: 'Capability is registered but not in this plugin\'s vector.',
    httpStatus: 403,
    severity: 'error',
    category: 'core',
    developerHint:
      'Same as `PERMISSION_DENIED` but specific to the registry path. Add the capability to the manifest + grant via UI.',
    data: z.object({ capabilityId: z.string() }).passthrough(),
  },

  INVALID_SCOPE: {
    description: 'Granted scope value failed the spec\'s scope schema.',
    httpStatus: 500,
    severity: 'error',
    category: 'core',
    developerHint:
      'Operator error — a row in the StateStore carries a malformed scope. Re-grant the capability via the UI.',
  },

  // ─── Workflow validation (diagnostic-only, not thrown) ────────────────────
  //
  // These codes annotate validation results returned from the workflow graph
  // checker. They never appear in a BrikaError throw — they're emitted as
  // `{ severity, code, message, path }` records on the validation report.

  WORKFLOW_UNKNOWN_BLOCK_TYPE: {
    description: 'A block references a block type that is not registered.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
    developerHint:
      'Either the plugin that provides the block type isn\'t loaded, or the workflow file is out of date.',
  },

  WORKFLOW_UNKNOWN_TARGET_BLOCK_TYPE: {
    description: 'A connection points to a block whose type is unknown.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_INVALID_PORT_REF: {
    description: 'A connection port reference is structurally invalid.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_INVALID_CONNECTION: {
    description: 'A connection between two ports is type-incompatible.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_SOURCE_BLOCK_NOT_FOUND: {
    description: 'A connection references a source block that does not exist.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_TARGET_BLOCK_NOT_FOUND: {
    description: 'A connection references a target block that does not exist.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_TARGET_PORT_NOT_FOUND: {
    description: 'A connection references a target port that does not exist on the target block.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_UNKNOWN_INPUT_PORT: {
    description: 'A block references an input port that its block type does not declare.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_UNKNOWN_OUTPUT_PORT: {
    description: 'A block references an output port that its block type does not declare.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_MISSING_BIDIRECTIONAL_REF: {
    description: 'A connection is declared on one block but not mirrored on the other.',
    httpStatus: 422,
    severity: 'error',
    category: 'workflow',
  },

  WORKFLOW_ORPHAN_BLOCK: {
    description: 'A block has no connections in or out.',
    httpStatus: 422,
    severity: 'warning',
    category: 'workflow',
  },
} as const satisfies Record<string, CatalogEntry>;

/**
 * Every error code the platform documents — derived from the catalog so
 * adding a code in one place automatically widens the union.
 */
export type CatalogedErrorCode = keyof typeof ErrorCatalog;

/**
 * Look up a catalog entry. Returns undefined for codes not in the catalog
 * (third-party codes, codes added in a newer hub version, etc.).
 */
export function lookupCatalogEntry(code: string): CatalogEntry | undefined {
  return (ErrorCatalog as Record<string, CatalogEntry>)[code];
}

/**
 * HTTP status for a code, defaulting to 500 if uncatalogued. Used by hub
 * route handlers that surface BrikaErrors as HTTP responses.
 */
export function httpStatusForCode(code: string): number {
  return lookupCatalogEntry(code)?.httpStatus ?? 500;
}
