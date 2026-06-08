/**
 * Execution-context resolver: the SINGLE source of truth for "where does Brika
 * keep its data, and am I a compiled binary" facts.
 *
 * Every input is injected (no ambient process.* reads here) so the logic is
 * unit-testable and identical across all callers: the hub (brika-context),
 * the full console CLI (paths), and the lean @brika/sdk bin (cli/hub). This
 * collapses what used to be a 4x-duplicated `/$bunfs/` sniff and a 3x-copied
 * (and once-drifted) data-dir walk into one tested module.
 *
 * Leaf module: imports only node:fs + node:path so it bundles into the lean bin
 * and adds no runtime dependency.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * True when running from a `bun build --compile` binary, whose modules live in
 * Bun's virtual `/$bunfs/` filesystem. Pass the CALLER's `import.meta.path`
 * (the check is per-module). This is the ONLY place the bunfs prefix is hard
 * coded: if a future Bun renames it, fix it here and every caller follows.
 */
export function isCompiledFrom(importMetaPath: string): boolean {
  return importMetaPath.startsWith('/$bunfs/');
}

/**
 * Walk up from `cwd` for the workspace-root package.json (the one with a
 * `workspaces` field). Returns undefined outside any workspace. Capped at
 * `maxDepth` (default 12) levels.
 */
export function findWorkspaceRoot(opts: { cwd: string; maxDepth?: number }): string | undefined {
  const maxDepth = opts.maxDepth ?? 12;
  let dir = opts.cwd;
  for (let i = 0; i < maxDepth; i += 1) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(pkg, 'utf8'));
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'workspaces' in parsed &&
          parsed.workspaces !== undefined
        ) {
          return dir;
        }
      } catch {
        // Malformed package.json: keep climbing.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
  return undefined;
}

const INSTANCE_ID_RE = /^[0-9a-f]{8}$/;

/**
 * Read `<dataDir>/instance.id` WITHOUT generating one. The hub's own
 * readOrGenerateInstanceId mints a fresh id (and warns about orphaned keychain
 * entries) on a miss, which is wrong for read-only diagnostics. Returns null if
 * the file is missing or malformed.
 */
export function peekInstanceId(dataDir: string): string | null {
  try {
    const raw = readFileSync(join(dataDir, 'instance.id'), 'utf8').trim();
    return INSTANCE_ID_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Which rule decided the data dir. Lets `brika doctor` explain the resolution. */
export type DataDirSource = 'env' | 'compiled-parent' | 'workspace' | 'cwd';

export interface DataDirInput {
  /** Usually `process.env`; only BRIKA_HOME is read. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** From {@link isCompiledFrom}(import.meta.path) at the call site. */
  readonly isCompiled: boolean;
  /** `process.execPath` (the running binary; the Bun runtime in dev). */
  readonly execPath: string;
  /** `process.cwd()`. */
  readonly cwd: string;
}

/**
 * Resolve Brika's data directory (the `.brika` dir holding config, db,
 * cli-token, instance.id) from injected facts. Precedence:
 *   1. $BRIKA_HOME (explicit override)
 *   2. compiled binary -> parent of the install dir (dirname(dirname(execPath)))
 *   3. dev -> the workspace root's .brika (so the hub and the CLIs share ONE dir
 *      regardless of which package dir launched the process)
 *   4. fallback -> <cwd>/.brika
 */
export function resolveDataDir(input: DataDirInput): { path: string; source: DataDirSource } {
  if (input.env.BRIKA_HOME) {
    return { path: input.env.BRIKA_HOME, source: 'env' };
  }
  if (input.isCompiled) {
    return { path: dirname(dirname(input.execPath)), source: 'compiled-parent' };
  }
  const root = findWorkspaceRoot({ cwd: input.cwd });
  if (root) {
    return { path: join(root, '.brika'), source: 'workspace' };
  }
  return { path: join(input.cwd, '.brika'), source: 'cwd' };
}
