import { singleton } from '@brika/di';
import { filterPluginEnv } from './plugin-env';

/**
 * Encapsulates the Bun runtime used for spawning plugins and running
 * package-management commands (install / add / remove / update).
 *
 * Always uses `process.execPath` (the current Bun binary) with `BUN_BE_BUN=1`
 * so that child processes behave as a standard `bun` executable in both
 * standalone (compiled) and development modes — no separate bun binary required.
 *
 * Override with `BRIKA_BUN_PATH` env var to use a different bun binary.
 */
@singleton()
export class BunRunner {
  /** Absolute path to the binary used for all bun operations. */
  readonly bin: string;

  constructor() {
    this.bin = process.env.BRIKA_BUN_PATH ?? process.execPath;
  }

  /**
   * Environment for bun CLI / package-management spawns (install, add, etc).
   * Passes the full host env through — `bun install` needs `NPM_CONFIG_*`,
   * `BUN_INSTALL_*`, and similar to honor user/CI configuration.
   *
   * **Do NOT use this for plugin spawns** — use {@link pluginEnv} instead.
   * Plugins must not see operator secrets.
   */
  env(extra?: Record<string, string | undefined>): Record<string, string | undefined> {
    const base: Record<string, string | undefined> = {
      ...process.env,
      BUN_BE_BUN: '1',
    };
    return extra ? { ...base, ...extra } : base;
  }

  /**
   * Environment for plugin-process spawns. Strips operator secrets via
   * {@link filterPluginEnv} — plugins only see the allowlisted vars
   * (PATH, HOME, LANG, TZ, NODE_ENV, BRIKA_PLUGIN_*, BRIKA_SECRETS_*).
   *
   * Opt out for debugging via `BRIKA_PLUGIN_ENV_PASSTHROUGH=1` on the host.
   */
  pluginEnv(extra?: Record<string, string | undefined>): Record<string, string | undefined> {
    const base: Record<string, string | undefined> = {
      ...filterPluginEnv(process.env),
      BUN_BE_BUN: '1',
    };
    return extra ? { ...base, ...extra } : base;
  }

  /**
   * Spawn a bun process (package management commands, arbitrary bun CLI use).
   * `env` in options is merged on top of the base bun env — callers should NOT
   * spread process.env themselves.
   */
  spawn(
    args: string[],
    options: Omit<NonNullable<Parameters<typeof Bun.spawn>[1]>, 'env'> & {
      env?: Record<string, string | undefined>;
    } = {}
  ): ReturnType<typeof Bun.spawn> {
    const { env: extraEnv, ...rest } = options;
    return Bun.spawn([this.bin, ...args], {
      ...rest,
      env: this.env(extraEnv),
    });
  }
}
