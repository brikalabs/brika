/**
 * Generate a Knip configuration from the repo's own conventions.
 *
 * The generator knows NO package, framework, or dependency by name. Every
 * workspace's config comes from three domain-agnostic sources:
 *   1. Manifest fields: `bin` / `main` / `exports` point at the public source
 *      entries (library `exports` targeting `dist/x.js` map back to `src/x.ts`,
 *      since the build mirrors src 1:1). Workspace `paths` are derived the same
 *      way, so a cross-package `@scope/pkg/subpath` import resolves to source.
 *   2. Universal JS/monorepo conventions, gated purely on what exists on disk:
 *      co-located tests + fixtures, `examples/` + `scripts/`, root `*.config.ts`
 *      and Bun `*.macro.ts` (tool/build entry points), `__benchmarks__/` (bench
 *      runner entries), and a `template/` scaffolding dir (ignored).
 *   3. Per-package declarations: anything domain-specific (a framework's
 *      path-loaded entry dirs, a host-provided peer dependency a bundler
 *      externalizes, a bundled-bin source) lives in that package's own
 *      `package.json#knip` (the native knip workspace shape), so the knowledge
 *      sits WITH the package instead of as a branch in this file.
 */

import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Glob } from 'bun';
import { isObjectRecord } from './type-guards';
import { discoverPackages, type WorkspacePackage } from './workspace';

export interface KnipWorkspaceConfig {
  entry?: string[];
  ignore?: string[];
  ignoreDependencies?: string[];
  ignoreBinaries?: string[];
}

export interface KnipConfig {
  $schema?: string;
  workspaces?: Record<string, KnipWorkspaceConfig>;
  ignore?: string[];
  ignoreBinaries?: string[];
  ignoreDependencies?: string[];
  ignoreExportsUsedInFile?: boolean;
  paths?: Record<string, string[]>;
}

const DIST_JS_RE = /^\.\/dist\/(.+)\.js$/;
const byLocale = (a: string, b: string): number => a.localeCompare(b);

function stripDot(path: string): string {
  return path.replace(/^\.\//, '');
}

function distToSrc(distPath: string): string | undefined {
  const match = DIST_JS_RE.exec(distPath);
  return match ? `src/${match[1]}.ts` : undefined;
}

function* iterExportTargets(value: unknown): Generator<string> {
  if (typeof value === 'string') {
    yield value;
    return;
  }
  if (!isObjectRecord(value)) {
    return;
  }
  for (const inner of Object.values(value)) {
    yield* iterExportTargets(inner);
  }
}

function resolveExportToSource(value: unknown): string | undefined {
  for (const target of iterExportTargets(value)) {
    // A `types` condition points at a `.d.ts` stub that carries no runtime
    // import graph; skip it so a `{ types, default }` export resolves to its
    // real source (e.g. apps/hub `{ types: ./src/types.d.ts, default: ./src/main.ts }`).
    if (target.endsWith('.d.ts')) {
      continue;
    }
    if (target.startsWith('./src/')) {
      return stripDot(target);
    }
    const fromDist = distToSrc(target);
    if (fromDist) {
      return fromDist;
    }
  }
  return undefined;
}

function resolveBinTarget(target: string): string {
  return resolveExportToSource(target) ?? stripDot(target);
}

function collectBinEntries(bin: unknown): string[] {
  if (typeof bin === 'string') {
    return [resolveBinTarget(bin)];
  }
  if (!isObjectRecord(bin)) {
    return [];
  }
  const out: string[] = [];
  for (const value of Object.values(bin)) {
    if (typeof value === 'string') {
      out.push(resolveBinTarget(value));
    }
  }
  return out;
}

function collectExportEntries(exports: unknown): string[] {
  if (typeof exports === 'string') {
    const resolved = resolveExportToSource(exports);
    return resolved ? [resolved] : [];
  }
  if (!isObjectRecord(exports)) {
    return [];
  }
  const out = new Set<string>();
  for (const value of Object.values(exports)) {
    const resolved = resolveExportToSource(value);
    if (resolved) {
      out.add(resolved);
    }
  }
  return [...out];
}

async function dirExists(absDir: string): Promise<boolean> {
  try {
    return (await stat(absDir)).isDirectory();
  } catch {
    return false;
  }
}

/** True when at least one file under `absDir` matches the glob. */
async function hasMatch(absDir: string, pattern: string): Promise<boolean> {
  const scan = new Glob(pattern).scan({ cwd: absDir, onlyFiles: true });
  const first = await scan.next();
  return first.done !== true;
}

async function loadManifest(path: string): Promise<Record<string, unknown>> {
  const raw: unknown = await Bun.file(path).json();
  return isObjectRecord(raw) ? raw : {};
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

interface BuildContext {
  pkg: WorkspacePackage;
  dir: string;
  absDir: string;
  manifest: Record<string, unknown>;
}

async function addManifestEntries(ctx: BuildContext, entries: Set<string>): Promise<void> {
  for (const entry of collectBinEntries(ctx.manifest.bin)) {
    entries.add(entry);
  }
  for (const entry of collectExportEntries(ctx.manifest.exports)) {
    entries.add(entry);
  }
  const main = ctx.manifest.main;
  if (typeof main === 'string') {
    const resolved = resolveExportToSource(main);
    if (resolved) {
      entries.add(resolved);
    }
  }
  if (await dirExists(join(ctx.absDir, 'src'))) {
    // Co-located tests (and `.integration.test.*`) are entry roots: the test
    // runner invokes them, nothing imports them.
    entries.add('src/**/*.test.{ts,tsx}');
    // Fixtures are loaded by path from tests, so knip can't see the reference.
    entries.add('src/**/fixtures/**/*.{ts,tsx}');
  }
  if (await dirExists(join(ctx.absDir, 'src/__tests__'))) {
    entries.add('src/__tests__/**/*.test.{ts,tsx}');
  }
  for (const extras of ['examples', 'scripts']) {
    if (await dirExists(join(ctx.absDir, extras))) {
      entries.add(`${extras}/**/*.{ts,tsx}`);
    }
  }
}

/**
 * Structural conventions gated only on disk layout, never on a package name:
 * tool configs and Bun macros are entry points (loaded by path), benchmarks are
 * bench-runner roots like tests, and a `template/` dir is scaffolding copied
 * verbatim rather than imported.
 */
async function addConventionEntries(
  ctx: BuildContext,
  entries: Set<string>,
  ignore: Set<string>
): Promise<void> {
  if (await hasMatch(ctx.absDir, '*.config.ts')) {
    entries.add('*.config.ts');
  }
  if (await hasMatch(ctx.absDir, 'src/**/*.macro.ts')) {
    entries.add('src/**/*.macro.ts');
  }
  if (await hasMatch(ctx.absDir, 'src/**/__benchmarks__/**/*.{ts,tsx}')) {
    entries.add('src/**/__benchmarks__/**/*.{ts,tsx}');
  }
  if (await dirExists(join(ctx.absDir, 'template'))) {
    ignore.add('template/**');
  }
}

/**
 * Merge the package's own `package.json#knip` (native knip workspace shape) for
 * anything not derivable from conventions: a bundled bin's real source entry, a
 * path-loaded fixture, an intentionally-undeclared optional dependency. The
 * knowledge lives with the package, not as a branch here.
 */
function mergeDeclaredKnip(
  manifest: Record<string, unknown>,
  entries: Set<string>,
  ignore: Set<string>,
  ignoreDependencies: Set<string>
): void {
  const declared = manifest.knip;
  if (!isObjectRecord(declared)) {
    return;
  }
  for (const entry of toStringArray(declared.entry)) {
    entries.add(entry);
  }
  for (const pattern of toStringArray(declared.ignore)) {
    ignore.add(pattern);
  }
  for (const dep of toStringArray(declared.ignoreDependencies)) {
    ignoreDependencies.add(dep);
  }
}

async function buildWorkspaceConfig(
  root: string,
  pkg: WorkspacePackage
): Promise<KnipWorkspaceConfig> {
  const dir = dirname(pkg.relativePath);
  const ctx: BuildContext = {
    pkg,
    dir,
    absDir: join(root, dir),
    manifest: await loadManifest(pkg.path),
  };

  const entries = new Set<string>();
  const ignore = new Set<string>();
  const ignoreDependencies = new Set<string>();

  await addManifestEntries(ctx, entries);
  await addConventionEntries(ctx, entries, ignore);
  mergeDeclaredKnip(ctx.manifest, entries, ignore, ignoreDependencies);

  const config: KnipWorkspaceConfig = { entry: [...entries].sort(byLocale) };
  if (ignore.size > 0) {
    config.ignore = [...ignore].sort(byLocale);
  }
  if (ignoreDependencies.size > 0) {
    config.ignoreDependencies = [...ignoreDependencies].sort(byLocale);
  }
  return config;
}

/** Map one package's public subpaths to their source files (`@scope/pkg/x` -> `./dir/src/x.ts`). */
function packagePaths(dir: string, manifest: Record<string, unknown>): Record<string, string[]> {
  const name = manifest.name;
  const exports = manifest.exports;
  if (typeof name !== 'string' || !isObjectRecord(exports)) {
    return {};
  }
  const paths: Record<string, string[]> = {};
  for (const [subpath, value] of Object.entries(exports)) {
    const sourceRel = subpath.startsWith('.') ? resolveExportToSource(value) : undefined;
    if (sourceRel) {
      paths[subpath === '.' ? name : `${name}${subpath.slice(1)}`] = [`./${dir}/${sourceRel}`];
    }
  }
  return paths;
}

/**
 * Map every workspace package's public subpaths to source, so a cross-package
 * `@scope/pkg/subpath` import resolves to `src/...` even when the published
 * `exports` target `dist/` (which may not be built in a dev checkout). Derived
 * from each manifest's name + exports; no package is named here.
 */
async function buildWorkspacePaths(
  root: string,
  packages: readonly WorkspacePackage[]
): Promise<Record<string, string[]>> {
  const paths: Record<string, string[]> = {};
  for (const pkg of packages) {
    if (pkg.relativePath !== 'package.json') {
      const dir = dirname(pkg.relativePath);
      Object.assign(paths, packagePaths(dir, await loadManifest(join(root, pkg.relativePath))));
    }
  }
  return paths;
}

/**
 * The repo-root workspace: `scripts/*.ts` are runnable entries, and the deps it
 * uses only through tooling (which import paths knip can't follow) are declared
 * in the root `package.json#knip`, like any other workspace.
 */
async function buildRootConfig(root: string): Promise<KnipWorkspaceConfig> {
  const entries = new Set(['scripts/*.ts']);
  const ignore = new Set<string>();
  const ignoreDependencies = new Set<string>();
  mergeDeclaredKnip(
    await loadManifest(join(root, 'package.json')),
    entries,
    ignore,
    ignoreDependencies
  );
  const config: KnipWorkspaceConfig = { entry: [...entries].sort(byLocale) };
  if (ignoreDependencies.size > 0) {
    config.ignoreDependencies = [...ignoreDependencies].sort(byLocale);
  }
  return config;
}

export async function buildKnipConfig(root: string): Promise<KnipConfig> {
  const packages = await discoverPackages(root);
  const workspaces: Record<string, KnipWorkspaceConfig> = {
    '.': await buildRootConfig(root),
  };

  for (const pkg of packages) {
    if (pkg.relativePath === 'package.json') {
      continue;
    }
    const dir = dirname(pkg.relativePath);
    workspaces[dir] = await buildWorkspaceConfig(root, pkg);
  }

  return {
    $schema: 'https://unpkg.com/knip@6/schema.json',
    workspaces,
    ignoreExportsUsedInFile: true,
    ignoreBinaries: ['ps'],
    paths: await buildWorkspacePaths(root, packages),
  };
}
