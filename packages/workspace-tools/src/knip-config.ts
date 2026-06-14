/**
 * Generate a Knip configuration from the repo's own conventions.
 *
 * The generator knows NO package by name. Every workspace's config comes from
 * three generic sources:
 *   1. Manifest fields: `bin` / `main` / `exports` point at the public source
 *      entries (library `exports` targeting `dist/x.js` map back to `src/x.ts`,
 *      since the build mirrors src 1:1).
 *   2. Structural conventions, gated purely on what exists on disk: co-located
 *      tests + fixtures, `examples/` + `scripts/`, root `*.config.ts` and Bun
 *      `*.macro.ts` (tool/build entry points), `__benchmarks__/` (bench runner
 *      entries), a `template/` scaffolding dir (ignored), and the brika-plugin
 *      contract (`keywords: ["brika-plugin"]`) which loads `src/{bricks,blocks,
 *      pages}/**` by path and gets `react`/`lucide-react` as @brika/sdk peers.
 *   3. Per-package declarations: anything non-derivable lives in that package's
 *      own `package.json#knip` (the native knip workspace shape), so the
 *      knowledge sits WITH the package instead of as a branch in this file.
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

const PLUGIN_PEER_DEPS = ['react', 'lucide-react'];
const PLUGIN_KEYWORD = 'brika-plugin';
const SDK_PACKAGE = 'packages/sdk';
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

async function pathExists(absPath: string): Promise<boolean> {
  return await Bun.file(absPath).exists();
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

function isBrikaPlugin(manifest: Record<string, unknown>): boolean {
  return toStringArray(manifest.keywords).includes(PLUGIN_KEYWORD);
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

/** A brika plugin loads these by path at runtime; knip cannot follow the link. */
async function addPluginEntries(ctx: BuildContext, entries: Set<string>): Promise<void> {
  for (const sub of ['bricks', 'blocks', 'pages']) {
    if (await dirExists(join(ctx.absDir, 'src', sub))) {
      entries.add(`src/${sub}/**/*.{ts,tsx}`);
    }
  }
  for (const file of ['src/actions.ts', 'src/routes.ts']) {
    if (await pathExists(join(ctx.absDir, file))) {
      entries.add(file);
    }
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

  if (isBrikaPlugin(ctx.manifest)) {
    await addPluginEntries(ctx, entries);
    for (const dep of PLUGIN_PEER_DEPS) {
      ignoreDependencies.add(dep);
    }
  }

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

async function buildSdkPaths(root: string): Promise<Record<string, string[]>> {
  const sdkPkgPath = join(root, SDK_PACKAGE, 'package.json');
  if (!(await pathExists(sdkPkgPath))) {
    return {};
  }
  const manifest = await loadManifest(sdkPkgPath);
  const exports = manifest.exports;
  if (!isObjectRecord(exports)) {
    return {};
  }
  const paths: Record<string, string[]> = {};
  for (const [subpath, value] of Object.entries(exports)) {
    if (!subpath.startsWith('.')) {
      continue;
    }
    const sourceRel = resolveExportToSource(value);
    if (!sourceRel) {
      continue;
    }
    const importPath = subpath === '.' ? '@brika/sdk' : `@brika/sdk${subpath.slice(1)}`;
    paths[importPath] = [`./${SDK_PACKAGE}/${sourceRel}`];
  }
  return paths;
}

export async function buildKnipConfig(root: string): Promise<KnipConfig> {
  const packages = await discoverPackages(root);
  const workspaces: Record<string, KnipWorkspaceConfig> = {
    '.': {
      entry: ['scripts/*.ts'],
      ignoreDependencies: ['@brika/hub', '@brika/i18n-devtools', '@brika/sdk', '@brika/testing'],
    },
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
    paths: await buildSdkPaths(root),
  };
}
