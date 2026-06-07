/**
 * Typed factories for every cataloged error code.
 *
 * Prefer factories over `new BrikaError(...)`: they auto-build the message
 * from the catalog template, narrow the `data` argument to the catalog's
 * schema-derived type, and read autocomplete-friendly in IDEs.
 *
 * ```ts
 * import { errors } from '@brika/errors';
 *
 * throw errors.permissionDenied({ permission: 'location' });
 * throw errors.notFound({ resource: 'block:timer' }, { cause: dbError });
 * throw errors.internal({ cause: e });
 * throw errors.timeout({ operation: 'fetch', timeoutMs: 5000 });
 * ```
 *
 * Codes whose data schema is fully-optional or absent accept zero args.
 * `opts.cause` is always available for chaining.
 */

import {
  type BrikaErrorCode,
  type CatalogedErrorCode,
  type DataForCode,
  lookupCatalogEntry,
} from './catalog';
import { BrikaError } from './error';

/** Optional second-argument bag accepted by every factory. */
export interface FactoryOpts {
  /** Underlying error preserved on `err.cause`. */
  readonly cause?: unknown;
  /** Override the default catalog-built message. */
  readonly message?: string;
}

/**
 * Build a typed BrikaError from a cataloged code. Public helper used by
 * the `errors.*` factories; exposed so consumers can build factories for
 * codes the platform adds later without an SDK upgrade.
 */
export function buildError<C extends CatalogedErrorCode>(
  code: C,
  data: DataForCode<C>,
  opts?: FactoryOpts
): BrikaError<C, DataForCode<C>> {
  const entry = lookupCatalogEntry(code);
  // Catalog membership is guaranteed by the `CatalogedErrorCode` constraint,
  // but `lookupCatalogEntry` returns `CatalogEntry | undefined`. Surface that
  // narrowing here so the message build is type-safe.
  const message = opts?.message ?? entry?.message(data) ?? code;
  return new BrikaError(code, message, { data, cause: opts?.cause });
}

/**
 * Build a typed BrikaError for an uncataloged code. Useful for plugin-defined
 * codes that aren't in the platform catalog but should still flow through
 * the same wire/HTTP machinery.
 */
export function buildCustomError<C extends Exclude<BrikaErrorCode, CatalogedErrorCode>>(
  code: C,
  message: string,
  opts?: FactoryOpts & { readonly data?: Record<string, unknown> }
): BrikaError<C> {
  return new BrikaError(code, message, { data: opts?.data, cause: opts?.cause });
}

// ─── Factories ─────────────────────────────────────────────────────────────
// One factory per cataloged code. The signature uses `DataForCode<C>` so the
// caller writes the typed object directly: `errors.permissionDenied({permission})`.
//
// Codes WITHOUT a data schema (DataForCode = undefined) accept `(opts?)` only.
// Codes WITH all-optional data accept either form.

export const errors = {
  internal: (opts?: FactoryOpts) => buildError<'INTERNAL'>('INTERNAL', undefined, opts),

  invalidInput: (data: DataForCode<'INVALID_INPUT'> = {}, opts?: FactoryOpts) =>
    buildError<'INVALID_INPUT'>('INVALID_INPUT', data, opts),

  notFound: (data: DataForCode<'NOT_FOUND'>, opts?: FactoryOpts) =>
    buildError<'NOT_FOUND'>('NOT_FOUND', data, opts),

  permissionDenied: (data: DataForCode<'PERMISSION_DENIED'>, opts?: FactoryOpts) =>
    buildError<'PERMISSION_DENIED'>('PERMISSION_DENIED', data, opts),

  timeout: (data: DataForCode<'TIMEOUT'> = {}, opts?: FactoryOpts) =>
    buildError<'TIMEOUT'>('TIMEOUT', data, opts),

  unavailable: (opts?: FactoryOpts) => buildError<'UNAVAILABLE'>('UNAVAILABLE', undefined, opts),

  pluginNotFound: (data: DataForCode<'PLUGIN_NOT_FOUND'>, opts?: FactoryOpts) =>
    buildError<'PLUGIN_NOT_FOUND'>('PLUGIN_NOT_FOUND', data, opts),

  pluginConfigInvalid: (data: DataForCode<'PLUGIN_CONFIG_INVALID'>, opts?: FactoryOpts) =>
    buildError<'PLUGIN_CONFIG_INVALID'>('PLUGIN_CONFIG_INVALID', data, opts),

  manifestInvalid: (data: DataForCode<'MANIFEST_INVALID'>, opts?: FactoryOpts) =>
    buildError<'MANIFEST_INVALID'>('MANIFEST_INVALID', data, opts),

  manifestMissingMain: (data: DataForCode<'MANIFEST_MISSING_MAIN'>, opts?: FactoryOpts) =>
    buildError<'MANIFEST_MISSING_MAIN'>('MANIFEST_MISSING_MAIN', data, opts),

  pluginDepsInstallFailed: (data: DataForCode<'PLUGIN_DEPS_INSTALL_FAILED'>, opts?: FactoryOpts) =>
    buildError<'PLUGIN_DEPS_INSTALL_FAILED'>('PLUGIN_DEPS_INSTALL_FAILED', data, opts),

  // ─── grants ──────────────────────────────────────────────────────────
  alreadyRegistered: (data: DataForCode<'ALREADY_REGISTERED'>, opts?: FactoryOpts) =>
    buildError<'ALREADY_REGISTERED'>('ALREADY_REGISTERED', data, opts),

  notRegistered: (data: DataForCode<'NOT_REGISTERED'>, opts?: FactoryOpts) =>
    buildError<'NOT_REGISTERED'>('NOT_REGISTERED', data, opts),

  invalidOutput: (data: DataForCode<'INVALID_OUTPUT'>, opts?: FactoryOpts) =>
    buildError<'INVALID_OUTPUT'>('INVALID_OUTPUT', data, opts),

  invalidScope: (data: DataForCode<'INVALID_SCOPE'>, opts?: FactoryOpts) =>
    buildError<'INVALID_SCOPE'>('INVALID_SCOPE', data, opts),

  netHostNotAllowed: (data: DataForCode<'NET_HOST_NOT_ALLOWED'>, opts?: FactoryOpts) =>
    buildError<'NET_HOST_NOT_ALLOWED'>('NET_HOST_NOT_ALLOWED', data, opts),

  netProtocolBlocked: (data: DataForCode<'NET_PROTOCOL_BLOCKED'>, opts?: FactoryOpts) =>
    buildError<'NET_PROTOCOL_BLOCKED'>('NET_PROTOCOL_BLOCKED', data, opts),

  netPrivateIpBlocked: (data: DataForCode<'NET_PRIVATE_IP_BLOCKED'>, opts?: FactoryOpts) =>
    buildError<'NET_PRIVATE_IP_BLOCKED'>('NET_PRIVATE_IP_BLOCKED', data, opts),

  netRedirectBlocked: (data: DataForCode<'NET_REDIRECT_BLOCKED'>, opts?: FactoryOpts) =>
    buildError<'NET_REDIRECT_BLOCKED'>('NET_REDIRECT_BLOCKED', data, opts),

  netRedirectLoop: (data: DataForCode<'NET_REDIRECT_LOOP'>, opts?: FactoryOpts) =>
    buildError<'NET_REDIRECT_LOOP'>('NET_REDIRECT_LOOP', data, opts),

  netBodyTooLarge: (data: DataForCode<'NET_BODY_TOO_LARGE'>, opts?: FactoryOpts) =>
    buildError<'NET_BODY_TOO_LARGE'>('NET_BODY_TOO_LARGE', data, opts),

  // ─── fs ──────────────────────────────────────────────────────────────
  fsPathOutsideRoot: (data: DataForCode<'FS_PATH_OUTSIDE_ROOT'>, opts?: FactoryOpts) =>
    buildError<'FS_PATH_OUTSIDE_ROOT'>('FS_PATH_OUTSIDE_ROOT', data, opts),

  fsSymlinkEscape: (data: DataForCode<'FS_SYMLINK_ESCAPE'>, opts?: FactoryOpts) =>
    buildError<'FS_SYMLINK_ESCAPE'>('FS_SYMLINK_ESCAPE', data, opts),

  fsQuotaExceeded: (data: DataForCode<'FS_QUOTA_EXCEEDED'>, opts?: FactoryOpts) =>
    buildError<'FS_QUOTA_EXCEEDED'>('FS_QUOTA_EXCEEDED', data, opts),

  fsFileTooLarge: (data: DataForCode<'FS_FILE_TOO_LARGE'>, opts?: FactoryOpts) =>
    buildError<'FS_FILE_TOO_LARGE'>('FS_FILE_TOO_LARGE', data, opts),

  fsAlreadyExists: (data: DataForCode<'FS_ALREADY_EXISTS'>, opts?: FactoryOpts) =>
    buildError<'FS_ALREADY_EXISTS'>('FS_ALREADY_EXISTS', data, opts),

  fsNotFound: (data: DataForCode<'FS_NOT_FOUND'>, opts?: FactoryOpts) =>
    buildError<'FS_NOT_FOUND'>('FS_NOT_FOUND', data, opts),

  // ─── ws ──────────────────────────────────────────────────────────────
  wsOpenLimitExceeded: (data: DataForCode<'WS_OPEN_LIMIT_EXCEEDED'>, opts?: FactoryOpts) =>
    buildError<'WS_OPEN_LIMIT_EXCEEDED'>('WS_OPEN_LIMIT_EXCEEDED', data, opts),

  wsHandleNotFound: (data: DataForCode<'WS_HANDLE_NOT_FOUND'>, opts?: FactoryOpts) =>
    buildError<'WS_HANDLE_NOT_FOUND'>('WS_HANDLE_NOT_FOUND', data, opts),

  wsFrameTooLarge: (data: DataForCode<'WS_FRAME_TOO_LARGE'>, opts?: FactoryOpts) =>
    buildError<'WS_FRAME_TOO_LARGE'>('WS_FRAME_TOO_LARGE', data, opts),

  // ─── ipc ─────────────────────────────────────────────────────────────
  ipcPayloadTooLarge: (data: DataForCode<'IPC_PAYLOAD_TOO_LARGE'>, opts?: FactoryOpts) =>
    buildError<'IPC_PAYLOAD_TOO_LARGE'>('IPC_PAYLOAD_TOO_LARGE', data, opts),
} as const;

// ─── Catalog completeness guard ────────────────────────────────────────────
// Compile-time check: every CATALOGED code that's meant to be thrown should
// have a factory. Workflow diagnostics are intentionally excluded (they are
// pushed onto validation results, never thrown as BrikaError).
//
// If a new throwable code is added to the catalog and a factory is forgotten,
// this assignment fails to compile, surfacing the gap.

type ThrowableCode = Exclude<CatalogedErrorCode, `WORKFLOW_${string}`>;
type FactoryKey = keyof typeof errors;
type FactoryCodeFromKey<K extends FactoryKey> = ReturnType<(typeof errors)[K]>['code'];
type CoveredCodes = FactoryCodeFromKey<FactoryKey>;

/**
 * Compile-time coverage proof. If a throwable code is missing from `errors`,
 * `CoveredCodes` won't include it and `true` is no longer assignable to the
 * conditional, so the file fails to compile, pointing at the gap.
 *
 * Exported (not just a local const) so it counts as used by lint rules.
 */
export const _factoryCoverageProof: ThrowableCode extends CoveredCodes ? true : never = true;
