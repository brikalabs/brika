/**
 * Build Info Macros
 *
 * These functions are executed at bundle-time using Bun macros.
 * The return values are inlined directly into the bundle.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const PackageJsonSchema = z.object({ version: z.string().min(1) });

export function getGitCommit(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'rev-parse', '--short', 'HEAD'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Full 40-char git commit SHA — used for exact build identification. */
export function getGitCommitFull(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'rev-parse', 'HEAD'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getGitBranch(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getBuildDate(): string {
  return new Date().toISOString();
}

/**
 * Build-time version string. CI sets `BRIKA_VERSION` from the git tag
 * (`v1.2.3` → `1.2.3`) or a canary recipe (`<base>-canary.<ts>.<sha>`).
 * Local dev falls back to `apps/hub/package.json` so `bun dev` and tests
 * keep working without the env var.
 */
export function getBrikaVersion(): string {
  const fromEnv = process.env.BRIKA_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const raw = readFileSync(join(import.meta.dir, '../package.json'), 'utf8');
  return PackageJsonSchema.parse(JSON.parse(raw)).version;
}
