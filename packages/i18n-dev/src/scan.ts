import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Read and parse all `.json` files in a directory into a `name → data` map. */
async function readJsonFiles(dir: string): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return map;
  }
  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      map.set(file.replace('.json', ''), JSON.parse(content) as Record<string, unknown>);
    } catch {
      // skip invalid JSON
    }
  }
  return map;
}

/** List subdirectories of a directory. */
async function listSubdirs(dir: string): Promise<{ name: string; path: string }[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: { name: string; path: string }[] = [];
  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const info = await stat(entryPath).catch(() => null);
    if (info?.isDirectory()) {
      results.push({ name: entry, path: entryPath });
    }
  }
  return results;
}

/**
 * Scan a core locale directory structured as `{locale}/{namespace}.json`.
 *
 * @returns Map of `locale → namespace → data`
 */
export async function scanLocaleDirectory(
  dir: string
): Promise<Map<string, Map<string, Record<string, unknown>>>> {
  const result = new Map<string, Map<string, Record<string, unknown>>>();
  for (const { name, path } of await listSubdirs(dir)) {
    const namespaces = await readJsonFiles(path);
    if (namespaces.size > 0) {
      result.set(name, namespaces);
    }
  }
  return result;
}

export interface PluginLocaleEntry {
  /** Package name from package.json (e.g. `@brika/plugin-weather`), falls back to dir name. */
  packageName: string;
  /** Absolute path to the plugin root directory. */
  rootDir: string;
  /** Scanned locale data: `locale → namespace → data`. */
  locales: Map<string, Map<string, Record<string, unknown>>>;
}

/**
 * Scan workspace packages for translations.
 *
 * Each package may have a `locales/{locale}/*.json` structure.  All JSON files
 * within a single locale are merged into one namespace called `"plugin"`.
 *
 * @param pluginRoots Absolute paths to individual package root directories.
 * @returns Array of plugin locale entries with package name + locale data.
 */
export async function scanPluginLocales(pluginRoots: string[]): Promise<PluginLocaleEntry[]> {
  const result: PluginLocaleEntry[] = [];

  for (const rootDir of pluginRoots) {
    let packageName = basename(rootDir);
    try {
      const raw = await readFile(join(rootDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      if (typeof pkg.name === 'string') {
        packageName = pkg.name;
      }
    } catch {
      // fall back to directory name
    }

    const localeMap = new Map<string, Map<string, Record<string, unknown>>>();

    for (const locale of await listSubdirs(join(rootDir, 'locales'))) {
      const files = await readJsonFiles(locale.path);
      let merged: Record<string, unknown> = {};
      for (const data of files.values()) {
        merged = { ...merged, ...data };
      }
      if (Object.keys(merged).length > 0) {
        const nsMap = new Map<string, Record<string, unknown>>();
        nsMap.set('plugin', merged);
        localeMap.set(locale.name, nsMap);
      }
    }

    if (localeMap.size > 0) {
      result.push({ packageName, rootDir, locales: localeMap });
    }
  }

  return result;
}

// ─── Workspace auto-discovery ─────────────────────────────────────────────

/**
 * Walk up from `startDir` to find the nearest package.json with a `workspaces` field.
 */
export async function findWorkspaceRoot(startDir: string): Promise<string | undefined> {
  let dir = startDir;
  for (;;) {
    try {
      const raw = await readFile(join(dir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(pkg.workspaces)) {
        return dir;
      }
    } catch {
      // no package.json here, keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Discover workspace packages that have a `locales/` subdirectory,
 * excluding the package that contains the core `localesDir`.
 */
export async function discoverPluginRoots(
  workspaceRoot: string,
  localesDir: string
): Promise<string[]> {
  let patterns: string[];
  try {
    const raw = await readFile(join(workspaceRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    patterns = Array.isArray(pkg.workspaces) ? (pkg.workspaces as string[]) : [];
  } catch {
    return [];
  }

  const roots: string[] = [];

  for (const pattern of patterns) {
    // Expand simple glob: "plugins/*" → list subdirectories of "plugins/"
    const parentDir = join(workspaceRoot, pattern.replace(/\/?\*$/, ''));
    let entries: string[];
    try {
      entries = await readdir(parentDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = join(parentDir, entry);
      // Skip if this package contains the core localesDir
      if (localesDir.startsWith(entryPath)) {
        continue;
      }
      const localesPath = join(entryPath, 'locales');
      const info = await stat(localesPath).catch(() => null);
      if (info?.isDirectory()) {
        roots.push(entryPath);
      }
    }
  }

  return roots;
}
