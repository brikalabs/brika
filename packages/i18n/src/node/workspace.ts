import { basename, dirname } from 'node:path';
import { z } from 'zod';
import type { TranslationData } from '../types';
import { type LoaderWarn, loadMergedLocaleFolder } from './loaders';

/**
 * Minimal `package.json` shape we read for workspace discovery and namespace
 * derivation. `passthrough()` keeps any other fields the consumer might pass
 * around — we just don't make claims about them.
 */
export const PackageJsonSchema = z.looseObject({
  name: z.string().optional(),
  workspaces: z.array(z.string()).optional(),
});

export type PackageJson = z.infer<typeof PackageJsonSchema>;

/** A directory that ships a `locales/` folder, tagged with a namespace. */
export interface NamespacedSource {
  /** Absolute path to the package root (the dir that contains `locales/`). */
  readonly dir: string;
  /** Namespace the locale files map to. */
  readonly namespace: string;
}

export interface DiscoverNamespacedSourcesOptions {
  /**
   * Transform a discovered package's name into a namespace. Receives the
   * value of `package.json#name` (or the directory's basename when no
   * `package.json` is present). Defaults to stripping the `@scope/` prefix.
   */
  readonly transformNamespace?: (packageName: string) => string;
}

export interface PackageLocaleEntry {
  /** Namespace derived from the package name (scope stripped by default). */
  namespace: string;
  /** Absolute path to the package root directory. */
  rootDir: string;
  /** locale → flat-merged JSON contents for the package. */
  locales: Map<string, TranslationData>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const stripScope = (name: string): string => name.replace(/^@[^/]+\//, '');

async function readPackageJson(path: string): Promise<PackageJson | undefined> {
  try {
    const raw: unknown = await Bun.file(path).json();
    const parsed = PackageJsonSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function listSubdirectories(parentDir: string): Promise<string[]> {
  try {
    const glob = new Bun.Glob('*/');
    const slashed = await Array.fromAsync(glob.scan({ cwd: parentDir, onlyFiles: false }));
    return slashed.map((s) => s.replace('/', '')).filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

async function readPackageName(packageDir: string): Promise<string> {
  const pkg = await readPackageJson(`${packageDir}/package.json`);
  return pkg?.name && pkg.name.length > 0 ? pkg.name : basename(packageDir);
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function findWorkspaceRoot(startDir: string): Promise<string | undefined> {
  let dir = startDir;
  for (;;) {
    const pkg = await readPackageJson(`${dir}/package.json`);
    if (pkg?.workspaces && pkg.workspaces.length > 0) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/**
 * Enumerate every subdirectory of `parentDir` that ships a `locales/` folder,
 * derive its namespace from `package.json#name`, and return one entry per
 * match. Sorted by namespace ascending.
 *
 * Lightweight — does not load locale data. Use `discoverPackageLocales` (or
 * the per-entry loader of your choice) for that. Returns `[]` if `parentDir`
 * doesn't exist, so callers can probe both `packages/` and `plugins/`
 * unconditionally.
 */
export async function discoverNamespacedSources(
  parentDir: string,
  options: DiscoverNamespacedSourcesOptions = {}
): Promise<NamespacedSource[]> {
  const transform = options.transformNamespace ?? stripScope;
  const subdirs = await listSubdirectories(parentDir);
  const sources: NamespacedSource[] = [];

  for (const name of subdirs) {
    const dir = `${parentDir}/${name}`;
    const localeDirs = await listSubdirectories(`${dir}/locales`);
    if (localeDirs.length === 0) {
      continue;
    }
    const pkgName = await readPackageName(dir);
    sources.push({ dir, namespace: transform(pkgName) });
  }

  return sources.sort((a, b) => a.namespace.localeCompare(b.namespace));
}

/**
 * Discover every workspace package under `<workspaceRoot>/packages` that
 * ships a `locales/` directory, and load its translations.
 *
 * Composes `discoverNamespacedSources` (enumeration + namespace derivation)
 * with `loadMergedLocaleFolder` (per-locale data loading). Callers that only
 * need the enumeration step should use `discoverNamespacedSources` directly.
 */
export async function discoverPackageLocales(
  workspaceRoot: string,
  warn?: LoaderWarn
): Promise<PackageLocaleEntry[]> {
  const sources = await discoverNamespacedSources(`${workspaceRoot}/packages`);
  const entries: PackageLocaleEntry[] = [];

  for (const { dir, namespace } of sources) {
    const locales = await loadLocalesForPackage(`${dir}/locales`, warn);
    if (locales.size > 0) {
      entries.push({ namespace, rootDir: dir, locales });
    }
  }

  return entries;
}

async function loadLocalesForPackage(
  localesDir: string,
  warn?: LoaderWarn
): Promise<Map<string, TranslationData>> {
  const localeNames = await listSubdirectories(localesDir);
  const out = new Map<string, TranslationData>();
  for (const locale of localeNames) {
    const { data } = await loadMergedLocaleFolder(`${localesDir}/${locale}`, warn);
    if (Object.keys(data).length > 0) {
      out.set(locale, data);
    }
  }
  return out;
}
