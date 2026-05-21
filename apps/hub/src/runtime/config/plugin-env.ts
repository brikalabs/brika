/**
 * Allowlist for environment variables exposed to spawned plugin processes.
 *
 * Without this filter, plugins inherit the full operator env via
 * `process.env` — including `GITHUB_TOKEN`, `AWS_*`, `DATABASE_URL`,
 * `OPENAI_API_KEY`, and any other secret the operator has set on the host.
 * A misbehaving or malicious plugin could read them in `onInit` and
 * exfiltrate them via its IPC channel.
 *
 * Only essential vars (process lookup, locale, brika-scoped) are passed
 * through. Anything else can be opted in via `BRIKA_PLUGIN_ENV_PASSTHROUGH`.
 *
 * @example
 * ```ts
 * const env = filterPluginEnv(process.env);
 * Bun.spawn(['plugin.ts'], { env });
 * ```
 */

/**
 * Exact-match names that always pass through. The set is intentionally
 * small — every entry should be justified.
 */
const ALLOWED_NAMES: ReadonlySet<string> = new Set([
  'PATH', // executable resolution (npm/node interop, shells)
  'HOME', // user home; some libs cache here
  'USER', // identity for log messages
  'LANG', // locale (text formatting)
  'TZ', // timezone (date math)
  'SHELL', // some bun internals shell-out
  'NODE_ENV', // production vs development branching
  'BUN_BE_BUN', // hub-set, runtime self-detection
]);

/**
 * Prefixes that pass through. Plugin-scoped (`BRIKA_PLUGIN_*`) and
 * platform-scoped (`BRIKA_SECRETS_*`) are explicitly intended for plugin
 * runtime — we mint the prefix, so any leak is our own.
 */
const ALLOWED_PREFIXES: readonly string[] = ['BRIKA_PLUGIN_', 'BRIKA_SECRETS_'];

/**
 * Filter an env map to the keys that plugins are allowed to see.
 *
 * Set `BRIKA_PLUGIN_ENV_PASSTHROUGH=1` on the host to disable filtering
 * for debugging — every host env var passes through, restoring the
 * pre-S1 behavior. Off by default; on in dev only if you opt in.
 */
export function filterPluginEnv(
  source: Readonly<Record<string, string | undefined>>
): Record<string, string | undefined> {
  if (source.BRIKA_PLUGIN_ENV_PASSTHROUGH) {
    return { ...source };
  }
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    if (isAllowed(key)) {
      out[key] = value;
    }
  }
  return out;
}

function isAllowed(key: string): boolean {
  if (ALLOWED_NAMES.has(key)) {
    return true;
  }
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}
