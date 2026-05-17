/**
 * Build targets registry.
 *
 * Adding a new target = appending one entry to {@link TARGETS}. The
 * compiler/bundler are target-agnostic — they read `entrypoint`,
 * `binaryName`, and optional `outputSubdir`, then drive Bun.build.
 *
 * Use `@brika/build build --target=<name>` to invoke a target by name,
 * or `--list` to print the table.
 */

import { join } from 'node:path';

/** Platforms accepted by `bun build --compile --target=…`. */
export const PLATFORMS = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-darwin-x64',
  'bun-darwin-arm64',
  'bun-windows-x64',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as ReadonlyArray<string>).includes(value);
}

export interface BuildTarget {
  /** Stable key used on the CLI (`--target=<name>`). */
  readonly name: string;
  /** Short one-line description for `--list`. */
  readonly description: string;
  /**
   * Repo-relative path to the entry source. The compiler resolves this
   * against the monorepo root so a single target works whether you run
   * `bun --filter @brika/build build` from the root or any workspace.
   */
  readonly entrypoint: string;
  /** Final binary basename (without extension; `.exe` is appended on Windows). */
  readonly binaryName: string;
  /**
   * Optional sub-directory under `apps/build/dist/` so multi-target
   * builds don't overwrite each other. Defaults to `name`.
   */
  readonly outputSubdir?: string;
}

const REPO_ROOT = join(import.meta.dir, '../../..');

export function resolveEntrypoint(target: BuildTarget): string {
  return join(REPO_ROOT, target.entrypoint);
}

export const TARGETS = {
  full: {
    name: 'full',
    description: 'Full operator binary — CLI + TUI + inline hub + embedded UI',
    entrypoint: 'apps/console/src/main.ts',
    binaryName: 'brika',
  },
  headless: {
    name: 'headless',
    description: 'Headless hub server — no CLI, no TUI, smaller footprint',
    entrypoint: 'apps/hub/src/main.ts',
    binaryName: 'brika-hub',
  },
} as const satisfies Record<string, BuildTarget>;

export type TargetName = keyof typeof TARGETS;

export function isTargetName(value: string): value is TargetName {
  return value in TARGETS;
}

export function getTarget(name: string): BuildTarget {
  if (!isTargetName(name)) {
    throw new Error(
      `Unknown target '${name}'. Available: ${Object.keys(TARGETS).join(', ')}.`
    );
  }
  return TARGETS[name];
}
