import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { discoverPackageLocales, findWorkspaceRoot, PackageJsonSchema } from '@brika/i18n/node';

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

const PLUGIN_NS_PREFIX = 'plugin:';

/**
 * Walk the brika workspace and return one `BrikaI18nSource` per package that
 * ships a `locales/` directory.
 *
 *   - `plugins/<pkg>/`   → namespace `plugin:<full-pkg-name>` (e.g.
 *     `plugin:@brika/plugin-weather`). The full scoped name is kept so the
 *     hub's namespace map matches what `tp('@brika/plugin-weather', ...)`
 *     looks up at runtime.
 *   - `packages/<pkg>/`  → namespace `<pkg-name-without-scope>` (`@brika/foo`
 *     → `foo`). Workspace utility packages share the same flat namespace
 *     surface as the host application; the brika scope is a publishing
 *     concern that doesn't survive into translation lookups.
 *
 * Generic `packages/*` discovery is delegated to `@brika/i18n/node`. The
 * brika-only piece — `plugin:` prefix for `plugins/*` — stays here so the
 * shared package remains framework-agnostic.
 */
export async function discoverBrikaI18nSources(repoRoot: string): Promise<BrikaI18nSource[]> {
  const packageEntries = await discoverPackageLocales(repoRoot);
  const pluginEntries = await discoverPluginSources(repoRoot);

  const sources: BrikaI18nSource[] = [
    ...packageEntries.map((entry) => ({
      dir: entry.rootDir,
      namespace: entry.namespace,
    })),
    ...pluginEntries,
  ];
  return sources.sort((a, b) => a.namespace.localeCompare(b.namespace));
}

async function discoverPluginSources(repoRoot: string): Promise<BrikaI18nSource[]> {
  const pluginsDir = join(repoRoot, 'plugins');
  let entries: string[];
  try {
    entries = await readdir(pluginsDir);
  } catch {
    return [];
  }
  const sources: BrikaI18nSource[] = [];
  for (const entry of entries) {
    const dir = join(pluginsDir, entry);
    const source = await tryMakePluginSource(dir);
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

async function tryMakePluginSource(dir: string): Promise<BrikaI18nSource | null> {
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) {
    return null;
  }
  if (!(await dirExists(join(dir, 'locales')))) {
    return null;
  }
  const packageName = await readPluginPackageName(dir);
  return { dir, namespace: `${PLUGIN_NS_PREFIX}${packageName}` };
}

async function dirExists(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null);
  return info?.isDirectory() ?? false;
}

async function readPluginPackageName(packageDir: string): Promise<string> {
  try {
    const raw: unknown = await Bun.file(join(packageDir, 'package.json')).json();
    const parsed = PackageJsonSchema.safeParse(raw);
    if (parsed.success && parsed.data.name) {
      return parsed.data.name;
    }
  } catch {
    // Unparseable or missing package.json — fall through to directory name.
  }
  return basename(packageDir);
}

/**
 * Walk up from `startDir` until a `package.json` with a `workspaces` field
 * shows up. Re-export of `@brika/i18n/node`'s `findWorkspaceRoot` with a
 * brika-flavoured name so `vite.config.ts` reads naturally.
 */
export async function findBrikaWorkspaceRoot(startDir: string): Promise<string | null> {
  const root = await findWorkspaceRoot(startDir);
  return root ?? null;
}
