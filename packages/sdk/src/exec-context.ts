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
 * Name of the hidden folder inside the data dir that holds everything the hub
 * manages: databases, installed plugins, identity, update state, secrets,
 * materialized runtime. Only the human-authored files (`brika.yml`, `boards/`,
 * `workflows/`) stay at the data-dir root. Defined here so the hub, the console
 * CLI, and the lean bin all agree on one location.
 */
export const SYSTEM_DIR_NAME = '.system';

/**
 * The hub-managed `.system` directory under a given data dir. Single source of
 * truth for "where does the hub keep its internal files" so callers never
 * hardcode the folder name.
 */
export function resolveSystemDir(dataDir: string): string {
  return join(dataDir, SYSTEM_DIR_NAME);
}

/**
 * Read `<dataDir>/.system/instance.id` WITHOUT generating one. The hub's own
 * readOrGenerateInstanceId mints a fresh id (and warns about orphaned keychain
 * entries) on a miss, which is wrong for read-only diagnostics. Returns null if
 * the file is missing or malformed.
 */
export function peekInstanceId(dataDir: string): string | null {
  try {
    const raw = readFileSync(join(resolveSystemDir(dataDir), 'instance.id'), 'utf8').trim();
    return INSTANCE_ID_RE.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Which rule decided the data dir. Lets `brika doctor` explain the resolution. */
export type DataDirSource = 'env' | 'managed' | 'compiled-parent' | 'workspace' | 'cwd';

export interface DataDirInput {
  /** Usually `process.env`; reads BRIKA_HOME, BRIKA_INSTALL, and (Windows) LOCALAPPDATA/HOME/USERPROFILE. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** From {@link isCompiledFrom}(import.meta.path) at the call site. */
  readonly isCompiled: boolean;
  /** `process.execPath` (the running binary; the Bun runtime in dev). */
  readonly execPath: string;
  /** `process.cwd()`. */
  readonly cwd: string;
  /** `os.homedir()`. Only consulted for the package-manager-install (per-user) path. */
  readonly home?: string;
  /** `process.platform`. Only consulted for the package-manager-install (per-user) path. */
  readonly platform?: string;
}

/**
 * The env var the package-manager launcher (the npm/pnpm/yarn/bun `bin` shim)
 * exports before exec'ing the binary, and its value. Single source of truth for
 * the "a JS package manager owns this binary" marker, shared by the data-dir
 * resolver here and the hub's runtime-mode / update-guidance logic. The shim
 * itself (`npm/brika/bin/brika.mjs`) hardcodes the same literal, since a
 * standalone `.mjs` can't import from the SDK.
 */
export const MANAGED_INSTALL_ENV = 'BRIKA_INSTALL';
export const MANAGED_INSTALL_MARKER = 'managed';

/** Inputs for {@link isManagedInstall}: the running binary's env and path. */
export interface ManagedInstallInput {
  /** Usually `process.env`; reads {@link MANAGED_INSTALL_ENV}. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** `process.execPath` (the running binary). */
  readonly execPath: string;
}

/**
 * True when the binary is owned by a JS package manager (npm/pnpm/yarn/bun)
 * rather than the `curl | sh` installer. Two signals: the bin shim exports the
 * managed marker before exec'ing the binary, and a package-manager-placed binary
 * lives under a `node_modules` tree. Either suffices.
 *
 * Compiled-only callers (data dir, runtime mode) additionally gate on
 * `isCompiled` so a dev runtime that happens to live under node_modules isn't
 * misread; the uninstaller calls it ungated, since declining to delete a
 * possibly-manager-owned binary is the safe default.
 */
export function isManagedInstall(input: ManagedInstallInput): boolean {
  return (
    input.env[MANAGED_INSTALL_ENV] === MANAGED_INSTALL_MARKER ||
    input.execPath.includes('node_modules')
  );
}

/**
 * Per-user data dir, used for package-manager installs (the binary lives in
 * node_modules, which an update/reinstall would wipe, so data must NOT be binary-relative).
 * Matches what the `curl | sh` / PowerShell installers already produce, so the
 * two install methods share one location:
 *   - Windows -> `%LOCALAPPDATA%\brika`
 *   - else    -> `~/.brika`
 */
function userDataDir(input: DataDirInput): string {
  const home = input.home ?? input.env.HOME ?? input.env.USERPROFILE ?? '';
  if (input.platform === 'win32') {
    const localAppData = input.env.LOCALAPPDATA ?? (home ? join(home, 'AppData', 'Local') : '');
    return join(localAppData, 'brika');
  }
  return join(home, '.brika');
}

/**
 * Resolve Brika's data directory (the `.brika` dir holding config, db,
 * cli-token, instance.id) from injected facts. Precedence:
 *   1. $BRIKA_HOME (explicit override)
 *   2. compiled binary installed by a package manager -> per-user dir (NOT
 *      binary-relative, since the binary sits in node_modules)
 *   3. compiled binary -> parent of the install dir (dirname(dirname(execPath)))
 *   4. dev -> the workspace root's .brika (so the hub and the CLIs share ONE dir
 *      regardless of which package dir launched the process)
 *   5. fallback -> <cwd>/.brika
 */
export function resolveDataDir(input: DataDirInput): { path: string; source: DataDirSource } {
  if (input.env.BRIKA_HOME) {
    return { path: input.env.BRIKA_HOME, source: 'env' };
  }
  if (input.isCompiled && isManagedInstall(input)) {
    return { path: userDataDir(input), source: 'managed' };
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
