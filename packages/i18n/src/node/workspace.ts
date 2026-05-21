import { dirname } from 'node:path';
import { z } from 'zod';
import type { TranslationData } from '../types';
import { type LoaderWarn, loadMergedLocaleFolder } from './loaders';

/**
 * Minimal `package.json` shape we read for workspace discovery and namespace
 * derivation. `passthrough()` keeps any other fields the consumer might pass
 * around — we just don't make claims about them.
 */
export const PackageJsonSchema = z
  .object({
    name: z.string().optional(),
    workspaces: z.array(z.string()).optional(),
  })
  .passthrough();

export type PackageJson = z.infer<typeof PackageJsonSchema>;

export interface PackageLocaleEntry {
  /** Namespace derived from the package name (scope stripped). */
  namespace: string;
  /** Absolute path to the package root directory. */
  rootDir: string;
  /** locale → flat-merged JSON contents for the package. */
  locales: Map<string, TranslationData>;
}

async function readPackageJson(path: string): Promise<PackageJson | undefined> {
  try {
    const raw: unknown = await Bun.file(path).json();
    const parsed = PackageJsonSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

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

export async function discoverPackageLocales(
  workspaceRoot: string,
  warn?: LoaderWarn
): Promise<PackageLocaleEntry[]> {
  const entries: PackageLocaleEntry[] = [];
  const packagesDir = `${workspaceRoot}/packages`;

  let packageDirs: string[];
  try {
    const glob = new Bun.Glob('*/');
    packageDirs = await Array.fromAsync(glob.scan({ cwd: packagesDir, onlyFiles: false }));
  } catch {
    return entries;
  }

  for (const dirSlash of packageDirs) {
    const dirName = dirSlash.replace('/', '');
    if (!dirName) {
      continue;
    }
    const rootDir = `${packagesDir}/${dirName}`;
    const localesMap = await collectPackageLocales(`${rootDir}/locales`, warn);
    if (localesMap.size === 0) {
      continue;
    }
    const namespace = await derivePackageNamespace(rootDir, dirName);
    entries.push({ namespace, rootDir, locales: localesMap });
  }

  return entries;
}

async function derivePackageNamespace(rootDir: string, dirName: string): Promise<string> {
  const pkg = await readPackageJson(`${rootDir}/package.json`);
  const name = pkg?.name;
  if (name && name.length > 0) {
    return name.replace(/^@[^/]+\//, '');
  }
  return dirName;
}

async function collectPackageLocales(
  localesDir: string,
  warn?: LoaderWarn
): Promise<Map<string, TranslationData>> {
  const result = new Map<string, TranslationData>();

  let localeDirs: string[];
  try {
    const glob = new Bun.Glob('*/');
    localeDirs = await Array.fromAsync(glob.scan({ cwd: localesDir, onlyFiles: false }));
  } catch {
    return result;
  }

  for (const dirSlash of localeDirs) {
    const locale = dirSlash.replace('/', '');
    if (!locale) {
      continue;
    }
    const { data } = await loadMergedLocaleFolder(`${localesDir}/${locale}`, warn);
    if (Object.keys(data).length > 0) {
      result.set(locale, data);
    }
  }

  return result;
}
