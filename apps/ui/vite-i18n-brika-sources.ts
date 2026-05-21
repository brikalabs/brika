import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Shape consumed by `@brika/i18n-devtools`' `sources` option. Each entry
 * names a directory whose `locales/<lang>/*.json` files belong to a single
 * logical namespace. The dev plugin merges them at scan time; this helper
 * only handles *discovery* — which folders count, and what namespace each
 * one maps to under brika's conventions.
 */
export interface BrikaI18nSource {
  /** Absolute path to the package root (the dir that contains `locales/`). */
  readonly dir: string;
  /** Namespace the locale files map to (e.g. `'plugin:@brika/plugin-weather'`). */
  readonly namespace: string;
}
const packageJsonSchema = z.object({
  name: z.string().optional(),
});

/**
 * Walk the brika workspace and return one `BrikaI18nSource` per package that
 * ships a `locales/` directory.
 *
 *   - `plugins/<pkg>/`   → namespace `plugin:<full-pkg-name>` (e.g.
 *     `plugin:@brika/plugin-weather`). The full scoped name is kept so the
 *     hub's namespace map matches what `tp('@brika/plugin-weather', ...)`
 *     looks up at runtime.
 *   - `packages/<pkg>/`  → namespace `<pkg-name-without-scope>` (`@brika/foo`
 *     → `foo`). Workspace utility packages just share the same flat namespace
 *     surface as the host application; the brika scope is a publishing
 *     concern that doesn't survive into translation lookups.
 *
 * Packages without a `locales/` folder are silently skipped (most
 * workspace packages don't ship UI strings).
 *
 * The helper deliberately does NOT recurse into nested workspaces or follow
 * symlinks — it reads the root `package.json#workspaces` array and expands
 * one level of `<dir>/*`.
 *
 * @param repoRoot Absolute path to the workspace root (the dir whose
 *   `package.json` carries the `workspaces` field).
 */
export async function discoverBrikaI18nSources(
  repoRoot: string
): Promise<BrikaI18nSource[]> {
  const workspaces = await readWorkspaces(repoRoot);
  const sources: BrikaI18nSource[] = [];
  for (const pattern of workspaces) {
    const expanded = expandWorkspacePattern(pattern);
    if (!expanded) {
      continue;
    }
    const collected = await collectFromCategory(repoRoot, expanded);
    sources.push(...collected);
  }
  // Stable ordering so the dev plugin's startup log is deterministic.
  return sources.sort((a, b) => a.namespace.localeCompare(b.namespace));
}

interface WorkspaceCategory {
  /** First path segment, e.g. `'plugins'` or `'packages'`. */
  readonly category: string;
  /** Absolute path to the directory whose entries are candidate packages. */
  readonly parentDir: string;
}

function expandWorkspacePattern(pattern: string): WorkspaceCategory | null {
  // We only handle the brika-style `'plugins/*'` / `'packages/*'` patterns.
  // Anything else (deep globs, exact paths, negation) is left to whatever
  // tooling expects to consume it — the i18n discovery is conservative.
  const match = /^([^/*]+)\/\*$/.exec(pattern);
  if (!match) {
    return null;
  }
  const category = match[1];
  if (!category) {
    return null;
  }
  return { category, parentDir: category };
}

async function collectFromCategory(
  repoRoot: string,
  category: WorkspaceCategory
): Promise<BrikaI18nSource[]> {
  const parent = join(repoRoot, category.parentDir);
  let entries: string[];
  try {
    entries = await readdir(parent);
  } catch {
    return [];
  }
  const sources: BrikaI18nSource[] = [];
  for (const entry of entries) {
    const dir = join(parent, entry);
    const source = await tryMakeSource(dir, category.category);
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

async function tryMakeSource(
  dir: string,
  category: string
): Promise<BrikaI18nSource | null> {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) {
    return null;
  }
  const hasLocales = await dirExists(join(dir, 'locales'));
  if (!hasLocales) {
    return null;
  }
  const packageName = await readPackageName(dir);
  const namespace = namespaceFor(category, packageName);
  return { dir, namespace };
}

async function dirExists(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  return info?.isDirectory() ?? false;
}

async function readPackageName(packageDir: string): Promise<string> {
  try {
    const raw = await readFile(join(packageDir, 'package.json'), 'utf-8');
    const parsed = packageJsonSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.name) {
      return parsed.data.name;
    }
  } catch {
    // Unparseable or missing package.json — fall through to directory name.
  }
  return basename(packageDir);
}

function namespaceFor(category: string, packageName: string): string {
  if (category === 'plugins') {
    return `plugin:${packageName}`;
  }
  // `packages/*` — drop the `@brika/` scope so the namespace is a flat token.
  return stripBrikaScope(packageName);
}

function stripBrikaScope(name: string): string {
  const PREFIX = '@brika/';
  if (name.startsWith(PREFIX)) {
    return name.slice(PREFIX.length);
  }
  return name;
}

async function readWorkspaces(repoRoot: string): Promise<string[]> {
  const raw = await readFile(join(repoRoot, 'package.json'), 'utf-8');
  const parsed = workspaceFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    return [];
  }
  return parsed.data.workspaces;
}

const workspaceFileSchema = z.object({
  workspaces: z.array(z.string()).default([]),
});

/**
 * Walk up from `startDir` until a `package.json` with a `workspaces` field
 * shows up. Used by `vite.config.ts` so the helper can be called without
 * baking the repo path into the config file.
 */
export async function findBrikaWorkspaceRoot(startDir: string): Promise<string | null> {
  let dir = startDir;
  while (true) {
    if (await isWorkspaceRootDir(dir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

async function isWorkspaceRootDir(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf-8');
    const parsed = workspaceProbeSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.workspaces.length > 0;
  } catch {
    return false;
  }
}

const workspaceProbeSchema = z.object({
  workspaces: z.array(z.string()).default([]),
});
