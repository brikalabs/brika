/**
 * Runtime Environment Detection
 *
 * Identifies how the hub binary is being hosted so the updater can pick
 * the right path. The self-updater rewrites `process.execPath` and the
 * adjacent `ui/` dir in place — that's fine for a bare-metal binary
 * install, but inside Docker the next `docker run` boots from the image
 * layer again, so the in-place rewrite would be silently undone.
 *
 * Result is computed once at module load. To force a value (e.g. CI),
 * set `BRIKA_RUNTIME` to one of the literals below.
 */

import { existsSync } from 'node:fs';

export type RuntimeKind = 'binary' | 'docker';

/**
 * Pure detection — explicit deps make the tests trivial. Reads:
 *   1. `BRIKA_RUNTIME` env override (forced value for tests / unusual hosts).
 *   2. `/.dockerenv` presence (Docker + most OCI-compatible runtimes).
 *   3. Defaults to `binary`.
 */
export function detectRuntime(
  env: NodeJS.ProcessEnv = process.env,
  hasDockerEnvFile: () => boolean = () => existsSync('/.dockerenv')
): RuntimeKind {
  const override = env.BRIKA_RUNTIME?.trim().toLowerCase();
  if (override === 'docker' || override === 'binary') {
    return override;
  }
  if (hasDockerEnvFile()) {
    return 'docker';
  }
  return 'binary';
}

export const runtimeKind: RuntimeKind = detectRuntime();

export function isManagedRuntime(): boolean {
  return runtimeKind !== 'binary';
}
