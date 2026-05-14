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

const ROOT_RE = /\$\{root\}/g;
const ENV_RE = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandVars(value: string, vars: { readonly root: string }): string {
  return value
    .replace(ROOT_RE, vars.root)
    .replace(ENV_RE, (_, name: string) => process.env[name] ?? '');
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
