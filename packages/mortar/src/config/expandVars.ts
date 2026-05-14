/**
 * Variable expansion for `mortar.yml` string fields.
 *
 * Supported substitutions:
 *
 *   ${root}     → absolute path to the directory containing `mortar.yml`
 *                 (a.k.a. the project root mortar spawns services from)
 *   ${env:NAME} → process.env.NAME, or empty string if unset
 *
 * Bare `${NAME}` (without the `env:` prefix) is left alone so it can
 * flow through to the child process's shell or runtime if appropriate.
 * Forcing the `env:` prefix makes mortar substitutions explicit and
 * prevents accidental capture of arbitrary env vars by typo.
 *
 * Used by `loadConfig` to expand `env`, `command`, `cwd`, and `url`
 * values after validation.
 */

// `${env:NAME}` — name starts with a non-digit word char, body is word chars.
// `\w` is `[A-Za-z0-9_]`; the leading `[^\d\W]` rules out a leading digit
// while still being a single character class.
const ENV_RE = /\$\{env:([^\d\W]\w*)\}/g;

export function expandVars(value: string, vars: { readonly root: string }): string {
  return value
    .replaceAll('${root}', vars.root)
    .replaceAll(ENV_RE, (_, name: string) => process.env[name] ?? '');
}

/**
 * Expand every interpolatable field on a service spec. Pure — returns
 * a fresh spec, never mutates.
 */
export function expandServiceVars<
  T extends {
    readonly env: Record<string, string>;
    readonly command: string;
    readonly cwd: string | null;
    readonly url: string | null;
  },
>(spec: T, vars: { readonly root: string }): T {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.env)) {
    env[k] = expandVars(v, vars);
  }
  return {
    ...spec,
    env,
    command: expandVars(spec.command, vars),
    cwd: spec.cwd === null ? null : expandVars(spec.cwd, vars),
    url: spec.url === null ? null : expandVars(spec.url, vars),
  };
}
