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

export const ERROR_CATEGORIES = ['core', 'manifest', 'workflow', 'grants'] as const;
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

  // ─── grants ────────────────────────────────────────────────────────────
  // Codes thrown by @brika/grants registry. Plugin code sees them as
  // `BrikaError` rejections from `ctx.foo.bar(args)` calls.
  ALREADY_REGISTERED: entry({
    title: 'Grant already registered',
    description: 'A grant with this id was registered twice on the hub.',
    typeUri: `${TYPE_BASE}grants/already-registered`,
    status: 500,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'This is a hub-side bug: two grant specs share the same id. Audit the registry-factory.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Grant "${data.grantId}" was already registered.`,
  }),
  NOT_REGISTERED: entry({
    title: 'Grant not registered',
    description: 'Dispatched against a grant id the hub does not know.',
    typeUri: `${TYPE_BASE}grants/not-registered`,
    status: 404,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Either a typo in `ctx.<path>` / the manifest grants map, or the plugin is built against a newer SDK than the hub supports.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Grant "${data.grantId}" is not registered with this hub.`,
  }),
  INVALID_OUTPUT: entry({
    title: 'Grant output failed schema validation',
    description: 'A grant handler returned a value that does not match its declared result schema.',
    typeUri: `${TYPE_BASE}grants/invalid-output`,
    status: 500,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'This is a hub-side programming error: the handler returned data the spec rejects. Audit the handler implementation.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Handler for "${data.grantId}" returned an invalid result.`,
  }),
  INVALID_SCOPE: entry({
    title: 'Grant scope failed schema validation',
    description: 'The permitted scope for this grant does not match the spec schema.',
    typeUri: `${TYPE_BASE}grants/invalid-scope`,
    status: 500,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The scope stored in StateStore drifted from the schema, or a malformed scope reached dispatch. The grant was dropped from the vector.',
    data: z.object({ grantId: z.string() }),
    message: (data) => `Invalid scope for grant "${data.grantId}".`,
  }),

  // ─── net ──────────────────────────────────────────────────────────────
  /**
   * Per-grant denial when a `ctx.net.fetch` call targets a host outside
   * the permitted allow-list. `publicDataShape` redacts the full allow
   * list — the hub-side log keeps it, the plugin only sees its own
   * forbidden host so it can fix the call site without learning what
   * else the operator permitted.
   */
  NET_HOST_NOT_ALLOWED: entry({
    title: 'Network host not allowed',
    description: "A net.fetch call targeted a host outside the plugin's allow-list.",
    typeUri: `${TYPE_BASE}grants/net-host-not-allowed`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      "Add the host to the `allow` array under your manifest's `dev.brika.net.fetch` grant, then ask the operator to re-grant.",
    data: z.object({
      host: z.string(),
      // Full operator allow-list — kept in hub logs only.
      allow: z.array(z.string()),
    }),
    publicDataShape: z.object({ host: z.string() }),
    message: (data) => `net.fetch: host "${data.host}" is not in this plugin's allow list.`,
  }),
  /**
   * URL protocol other than `http:` or `https:`. Blocks SSRF via `file:`,
   * `data:`, `gopher:`, etc. The hostname check would have already failed
   * for some of these (empty hostname for `file:///…`) but an explicit
   * protocol gate gives a clear error and doesn't rely on URL parser
   * quirks for security.
   */
  NET_PROTOCOL_BLOCKED: entry({
    title: 'Network protocol blocked',
    description: 'A net.fetch call used a protocol other than http(s).',
    typeUri: `${TYPE_BASE}grants/net-protocol-blocked`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint: 'Only `http:` and `https:` are accepted by net.fetch. Switch the URL scheme.',
    data: z.object({ protocol: z.string() }),
    message: (data) => `net.fetch: protocol "${data.protocol}" is not allowed.`,
  }),
  /**
   * DNS resolved the request hostname to an IP in a forbidden range
   * (RFC1918, loopback, link-local, multicast, etc.). Closes DNS-rebinding
   * SSRF where an attacker-controlled domain points at internal space.
   */
  NET_PRIVATE_IP_BLOCKED: entry({
    title: 'Network target IP blocked',
    description: 'Hostname resolved to a private or restricted IP range.',
    typeUri: `${TYPE_BASE}grants/net-private-ip-blocked`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The DNS record for this host resolves to private address space. The hub blocks egress to internal networks regardless of allow-list.',
    data: z.object({
      host: z.string(),
      // The forbidden IP and its category — hub-side log only.
      ip: z.string(),
      category: z.string(),
    }),
    publicDataShape: z.object({ host: z.string() }),
    message: (data) => `net.fetch: host "${data.host}" resolves to a blocked IP range.`,
  }),
  /**
   * A 3xx response had a `Location` whose host is outside the allow-list.
   * Without this check, a permitted host could redirect a plugin to
   * internal endpoints — the original SSRF vector behind manual-redirect
   * handling.
   */
  NET_REDIRECT_BLOCKED: entry({
    title: 'Network redirect blocked',
    description: 'A redirect target was outside the allow-list.',
    typeUri: `${TYPE_BASE}grants/net-redirect-blocked`,
    status: 403,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      "A 3xx response pointed at a host that isn't in this plugin's allow-list. Either add the target host or stop the call at the redirect.",
    data: z.object({
      from: z.string(),
      to: z.string(),
      allow: z.array(z.string()),
    }),
    publicDataShape: z.object({ from: z.string(), to: z.string() }),
    message: (data) =>
      `net.fetch: redirect from "${data.from}" to "${data.to}" was blocked by the allow-list.`,
  }),
  /**
   * Too many redirect hops. Capped to prevent open-redirect chains and
   * pathological loops; the cap is intentionally lower than the platform
   * default (5 vs. 20) because every hop is also paying the host re-check.
   */
  NET_REDIRECT_LOOP: entry({
    title: 'Network redirect loop',
    description: 'A net.fetch call exceeded the maximum redirect hop count.',
    typeUri: `${TYPE_BASE}grants/net-redirect-loop`,
    status: 508,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The target chained more than the configured redirect hops. Investigate the upstream — this is almost always a misconfiguration on the remote side.',
    data: z.object({
      url: z.string(),
      hops: z.number().int().nonnegative(),
    }),
    publicDataShape: z.object({ hops: z.number().int().nonnegative() }),
    message: (data) =>
      `net.fetch: redirect chain exceeded ${data.hops} hops starting from "${data.url}".`,
  }),
  /**
   * Response body exceeded `maxResponseBytes`. Streamed read aborts the
   * underlying request as soon as the cap is hit so a hostile server can't
   * OOM the hub by sending an unbounded body to an allow-listed endpoint.
   */
  NET_BODY_TOO_LARGE: entry({
    title: 'Network body too large',
    description: 'Response body exceeded the configured maximum size.',
    typeUri: `${TYPE_BASE}grants/net-body-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The response exceeded the `maxResponseBytes` cap. Raise the cap on the call (within the operator-set ceiling) or fetch a smaller resource.',
    data: z.object({
      limit: z.number().int().positive(),
      received: z.number().int().nonnegative(),
    }),
    message: (data) =>
      `net.fetch: response body exceeded ${data.limit} bytes (read ${data.received} before aborting).`,
  }),

  // ─── fs ──────────────────────────────────────────────────────────────
  /**
   * Path doesn't start with a known virtual root (`/bundle`, `/data`,
   * `/cache`, `/tmp`), or normalised away from one (`..` segment).
   */
  FS_PATH_OUTSIDE_ROOT: entry({
    title: 'Filesystem path outside virtual root',
    description: "A path didn't resolve to one of the plugin's virtual roots.",
    typeUri: `${TYPE_BASE}grants/fs-path-outside-root`,
    status: 400,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Use one of /bundle, /data, /cache, /tmp. Absolute host paths and `..` escapes are rejected.',
    data: z.object({ path: z.string() }),
    message: (data) => `fs: path "${data.path}" is outside the plugin's virtual roots.`,
  }),
  /**
   * A symlink target escaped the backing host directory after realpath.
   */
  FS_SYMLINK_ESCAPE: entry({
    title: 'Filesystem symlink escape',
    description: "A symlink resolved to a path outside the plugin's backing directory.",
    typeUri: `${TYPE_BASE}grants/fs-symlink-escape`,
    status: 400,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'The path passed virtual-root checks but its realpath escaped the backing dir. This is almost always a malicious symlink — investigate.',
    data: z.object({ path: z.string() }),
    publicDataShape: z.object({ path: z.string() }),
    message: (data) => `fs: symlink target for "${data.path}" escapes the plugin sandbox.`,
  }),
  /** Per-plugin disk quota for the root would be exceeded by this op. */
  FS_QUOTA_EXCEEDED: entry({
    title: 'Filesystem quota exceeded',
    description: "The plugin's quota for the target root would be exceeded.",
    typeUri: `${TYPE_BASE}grants/fs-quota-exceeded`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Reduce file size, clean up old files, or ask the operator to raise the per-plugin quota for this root.',
    data: z.object({
      root: z.string(),
      limit: z.number().int().nonnegative(),
      requested: z.number().int().nonnegative(),
    }),
    message: (data) =>
      `fs: quota for "${data.root}" would be exceeded (${data.requested} > ${data.limit} bytes).`,
  }),
  /** Single readFile / writeFile crossed the per-op size cap. */
  FS_FILE_TOO_LARGE: entry({
    title: 'Filesystem file too large',
    description: 'A single file operation exceeded the per-call size cap.',
    typeUri: `${TYPE_BASE}grants/fs-file-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    developerHint:
      'Chunked reads / writes will land in v2. For now, split large files into segments under the per-call cap.',
    data: z.object({
      limit: z.number().int().positive(),
      requested: z.number().int().nonnegative(),
    }),
    message: (data) => `fs: file size ${data.requested} exceeds per-call cap ${data.limit}.`,
  }),
  /** `create-new` mode hit an existing file. */
  FS_ALREADY_EXISTS: entry({
    title: 'Filesystem path already exists',
    description: 'A `create-new` write found an existing file at the path.',
    typeUri: `${TYPE_BASE}grants/fs-already-exists`,
    status: 409,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({ path: z.string() }),
    message: (data) => `fs: "${data.path}" already exists.`,
  }),
  /** Target path doesn't exist for an op that requires it. */
  FS_NOT_FOUND: entry({
    title: 'Filesystem path not found',
    description: "An fs operation targeted a path that doesn't exist.",
    typeUri: `${TYPE_BASE}grants/fs-not-found`,
    status: 404,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({ path: z.string() }),
    message: (data) => `fs: "${data.path}" not found.`,
  }),

  // ─── ws ──────────────────────────────────────────────────────────────
  /** Plugin opened more concurrent WebSocket connections than allowed. */
  WS_OPEN_LIMIT_EXCEEDED: entry({
    title: 'WebSocket open limit exceeded',
    description:
      'The plugin has reached the per-plugin maximum for simultaneously-open WebSocket connections.',
    typeUri: `${TYPE_BASE}grants/ws-open-limit-exceeded`,
    status: 429,
    severity: 'error',
    category: 'grants',
    retryable: true,
    transient: true,
    developerHint:
      'Close an existing WebSocket before opening another, or ask the operator to raise the per-plugin cap.',
    data: z.object({ limit: z.number().int().positive() }),
    message: (data) => `ws: per-plugin open-socket limit (${data.limit}) reached.`,
  }),
  /** Plugin referenced a handleId that isn't (or no longer is) registered. */
  WS_HANDLE_NOT_FOUND: entry({
    title: 'WebSocket handle not found',
    description: 'Plugin used a WebSocket handle that is closed or unknown.',
    typeUri: `${TYPE_BASE}grants/ws-handle-not-found`,
    status: 404,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({ handleId: z.string() }),
    message: (data) => `ws: handle "${data.handleId}" is not open.`,
  }),
  /** Plugin tried to send a frame larger than the per-call cap. */
  WS_FRAME_TOO_LARGE: entry({
    title: 'WebSocket frame too large',
    description: 'An outbound frame exceeded the per-call size cap.',
    typeUri: `${TYPE_BASE}grants/ws-frame-too-large`,
    status: 413,
    severity: 'error',
    category: 'grants',
    retryable: false,
    transient: false,
    data: z.object({
      limit: z.number().int().positive(),
      requested: z.number().int().nonnegative(),
    }),
    message: (data) => `ws: frame size ${data.requested} exceeds per-call cap ${data.limit}.`,
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
