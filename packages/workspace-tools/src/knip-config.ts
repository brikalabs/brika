/**
 * Generate a Knip configuration from the repo's own conventions.
 *
 * Most of what we'd otherwise hand-write into knip.json is derivable:
 *   - `bin` / `main` / `exports` fields point at the public source entries.
 *   - Library packages whose `exports` targets `dist/x.js` map back to `src/x.ts`
 *     (the build mirrors src 1:1).
 *   - Plugin workspaces follow the convention `src/{bricks,blocks,pages}/**`
 *     for dynamically-loaded code.
 *   - The hub loads `src/runtime/plugins/prelude/**` at runtime by path.
 *   - The UI app uses shadcn — `src/components/ui/**` is opt-in scaffolding.
 */

import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
const SHADCN_DIR = 'src/components/ui/**';
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

async function loadManifest(path: string): Promise<Record<string, unknown>> {
  const raw: unknown = await Bun.file(path).json();
  return isObjectRecord(raw) ? raw : {};
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
  if (await dirExists(join(ctx.absDir, 'src/__tests__'))) {
    entries.add('src/__tests__/**/*.test.{ts,tsx}');
  }
  for (const extras of ['examples', 'scripts']) {
    if (await dirExists(join(ctx.absDir, extras))) {
      entries.add(`${extras}/**/*.ts`);
    }
  }
}

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

async function addAppHubEntries(ctx: BuildContext, entries: Set<string>): Promise<void> {
  const macro = 'src/build-info.macro.ts';
  if (await pathExists(join(ctx.absDir, macro))) {
    entries.add(macro);
  }
  if (await dirExists(join(ctx.absDir, 'src/runtime/plugins/prelude'))) {
    entries.add('src/runtime/plugins/prelude/**/*.ts');
  }
}

async function addAppUiEntries(ctx: BuildContext, entries: Set<string>): Promise<void> {
  for (const file of ['src/main.tsx', 'src/router.tsx', 'arch.config.ts']) {
    if (await pathExists(join(ctx.absDir, file))) {
      entries.add(file);
    }
  }
  if (await dirExists(join(ctx.absDir, 'src/routes'))) {
    entries.add('src/routes/**/*.{ts,tsx}');
  }
}

async function addPackageQuirks(ctx: BuildContext, entries: Set<string>): Promise<void> {
  if (ctx.dir === 'packages/create-brika' && (await dirExists(join(ctx.absDir, 'src')))) {
    entries.add('src/**/*.ts');
  }
  if (ctx.dir === 'packages/db' && (await pathExists(join(ctx.absDir, 'database.config.ts')))) {
    entries.add('database.config.ts');
  }
  if (ctx.dir === 'packages/ipc') {
    if (await dirExists(join(ctx.absDir, 'src/__tests__/fixtures'))) {
      entries.add('src/__tests__/fixtures/**/*.ts');
    }
    if (await dirExists(join(ctx.absDir, 'src/__benchmarks__'))) {
      entries.add('src/__benchmarks__/**/*.ts');
    }
    if (await pathExists(join(ctx.absDir, '.benchmark-plugin.ts'))) {
      entries.add('.benchmark-plugin.ts');
    }
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

  if (dir.startsWith('plugins/')) {
    await addPluginEntries(ctx, entries);
    for (const dep of PLUGIN_PEER_DEPS) {
      ignoreDependencies.add(dep);
    }
  }
  if (dir === 'apps/hub') {
    await addAppHubEntries(ctx, entries);
  }
  if (dir === 'apps/ui') {
    await addAppUiEntries(ctx, entries);
    ignore.add(SHADCN_DIR);
  }
  if (dir === 'packages/create-brika' && (await dirExists(join(ctx.absDir, 'template')))) {
    ignore.add('template/**');
  }

  await addPackageQuirks(ctx, entries);

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
      ignoreDependencies: ['@brika/hub', '@brika/i18n-devtools', '@brika/testing'],
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
