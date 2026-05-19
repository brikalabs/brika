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
 *
 * The environment exposed to spawned processes is filtered via
 * {@link filterPluginEnv} — see `plugin-env.ts` for the allowlist policy and
 * the `BRIKA_PLUGIN_ENV_PASSTHROUGH` escape hatch.
 */
@singleton()
export class BunRunner {
  /** Absolute path to the binary used for all bun operations. */
  readonly bin: string;

  constructor() {
    this.bin = process.env.BRIKA_BUN_PATH ?? process.execPath;
  }

  /**
   * Returns the environment to pass to spawned bun processes.
   *
   * The base env is built from {@link filterPluginEnv} — only an allowlisted
   * subset of the hub's process.env is forwarded, so plugins cannot read
   * arbitrary host secrets. `BUN_BE_BUN=1` is always set. Optional `extra`
   * entries are merged on top and are NOT filtered (callers are trusted to
   * supply only safe values such as `BRIKA_PLUGIN_*`).
   */
  env(extra?: Record<string, string | undefined>): Record<string, string | undefined> {
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
