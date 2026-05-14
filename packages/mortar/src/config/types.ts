/**
 * `mortar.yml` schema types — what the YAML resolves to after parsing
 * and validation. Pure types: no runtime code lives here.
 *
 * The whole topology (services, commands, env, healthchecks, deps)
 * lives in the user's YAML — there is NO hardcoded topology in TS.
 */

export type HealthCheck =
  | { kind: 'http'; url: string; timeoutMs: number }
  | { kind: 'tcp'; port: number; timeoutMs: number }
  | { kind: 'auto'; timeoutMs: number }
  | { kind: 'none' };

export interface ServiceSpec {
  /** Stable key (set automatically from the YAML map key). */
  id: string;
  /** Human label shown in the TUI. */
  label: string;
  /** Shell-style command. Tokens split on whitespace; `"..."` / `'...'` quoting supported. */
  command: string;
  /** Env to add on top of `process.env`. */
  env: Record<string, string>;
  /** IDs of services that must be `healthy` before this one starts. */
  dependsOn: string[];
  /**
   * Working directory for the spawned command, relative to the
   * project root (directory containing `mortar.yml`). When omitted,
   * the command runs from the project root.
   */
  cwd: string | null;
  /**
   * Declared TCP port the service listens on. When set, this is the
   * authoritative answer to "what port is this service on?" — the
   * supervisor uses a TCP probe against it for health, derives the
   * browser URL from it, and skips the heuristic auto-detection.
   *
   * Prefer this over `health: { kind: tcp, port: N }` for the common
   * case of "service binds one well-known port" — it's terser and
   * also feeds URL derivation.
   */
  port: number | null;
  /** Healthcheck gate; `none` = "healthy as soon as it spawns". */
  health: HealthCheck;
  /**
   * Browser URL for this service. When omitted, derived from `port`
   * (if set) or the healthcheck. Explicit override for deep links /
   * query strings. `null` (and no derivable port) means "no URL to
   * open".
   */
  url: string | null;
}

export interface MortarConfig {
  /** Service list — order is preserved from the YAML for stable TUI display. */
  services: ServiceSpec[];
}

export interface ResolvedConfig {
  /** Absolute path to the YAML file on disk. */
  readonly path: string;
  /** Directory containing the YAML — services are spawned with this as cwd. */
  readonly root: string;
  readonly config: MortarConfig;
}
