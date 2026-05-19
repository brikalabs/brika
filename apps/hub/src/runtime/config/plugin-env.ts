/**
 * Plugin environment filtering.
 *
 * Plugins are third-party code running in the hub's process tree. To prevent
 * a plugin from being able to read arbitrary secrets out of the operator's
 * shell environment (e.g. `GITHUB_TOKEN`, `AWS_SECRET_ACCESS_KEY`, database
 * URLs), we hand each plugin a strictly-allowlisted subset of `process.env`
 * instead of the parent env in its entirety.
 *
 * The allowlist covers:
 *   - Locale / shell basics needed for any reasonable program: PATH, HOME,
 *     USER, LANG, LC_ALL, TZ, SHELL.
 *   - NODE_ENV and BUN_BE_BUN, which affect runtime behavior of the bun
 *     binary that hosts the plugin.
 *   - Anything prefixed with `BRIKA_PLUGIN_` — explicitly scoped to plugin
 *     configuration by the operator.
 *   - Anything prefixed with `BRIKA_SECRETS_` — controls the secret-store
 *     backend selection (see CLAUDE.md memory).
 *
 * Escape hatch: setting `BRIKA_PLUGIN_ENV_PASSTHROUGH` to a comma-separated
 * list of variable names will pass those through to plugins as well. This is
 * an operator opt-in for use cases where a specific plugin truly needs a
 * specific host variable; the hub logs a warning at startup if it sees this
 * variable so the leak is auditable.
 */

const BASIC_ALLOWLIST: ReadonlySet<string> = new Set([
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'TZ',
  'SHELL',
  'NODE_ENV',
  'BUN_BE_BUN',
]);

const PREFIX_ALLOWLIST: readonly string[] = ['BRIKA_PLUGIN_', 'BRIKA_SECRETS_'];

/** Name of the env var operators set to opt extra names into the passthrough. */
export const PLUGIN_ENV_PASSTHROUGH_VAR = 'BRIKA_PLUGIN_ENV_PASSTHROUGH';

/**
 * Parse the comma-separated allowlist from `BRIKA_PLUGIN_ENV_PASSTHROUGH`.
 * Returns the parsed names, trimmed and de-duplicated, in input order.
 */
export function parsePluginEnvPassthrough(source: NodeJS.ProcessEnv): readonly string[] {
  const raw = source[PLUGIN_ENV_PASSTHROUGH_VAR];
  if (!raw) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Returns the subset of `source` that is safe to expose to plugin processes.
 * Drops everything that is not explicitly allowlisted (basics, plugin/secret
 * prefixes, or named in `BRIKA_PLUGIN_ENV_PASSTHROUGH`).
 *
 * Pure / side-effect free — callers that want to log a passthrough warning
 * should do so separately at hub startup using `parsePluginEnvPassthrough`.
 */
export function filterPluginEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const passthroughExtras = new Set(parsePluginEnvPassthrough(source));
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (!isAllowed(key, passthroughExtras)) {
      continue;
    }
    filtered[key] = value;
  }

  return filtered;
}

function isAllowed(key: string, passthroughExtras: ReadonlySet<string>): boolean {
  if (BASIC_ALLOWLIST.has(key)) {
    return true;
  }
  if (passthroughExtras.has(key)) {
    return true;
  }
  for (const prefix of PREFIX_ALLOWLIST) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
