import { inject, singleton } from '@brika/di';
import { PluginPackageSchema } from '@brika/schema';
import type { VerifiedPluginsList } from '@brika/registry';
import type { PluginSearchResult, StorePlugin } from './types';
import { type BrikaConfig, ConfigLoader } from '@/runtime/config/config-loader';
import { computeEnrichment, enrichPlugins } from './enrich';
import { LocalRegistry } from './sources/local';
import { NpmRegistry } from './sources/npm';
import { VerifiedPluginsService } from './verified';

/**
 * Facade over all registry sources and enrichment.
 * Route handlers inject only this service — never individual registries directly.
 *
 * Plugin IDs support an optional source prefix: `local:name` or `npm:name`.
 * Without a prefix, local is tried first then npm.
 */
@singleton()
export class StoreService {
  readonly #npm = inject(NpmRegistry);
  readonly #local = inject(LocalRegistry);
  readonly #verified = inject(VerifiedPluginsService);
  readonly #configLoader = inject(ConfigLoader);

  /** Search all registry sources and return combined results (no deduplication). */
  async search(
    query?: string,
    limit = 20,
    offset = 0
  ): Promise<{ plugins: PluginSearchResult[]; total: number }> {
    const config = this.#configLoader.get();

    const [npmResult, localResult] = await Promise.all([
      this.#npm.search(query, limit, offset),
      this.#local.search(query),
    ]);

    const all = [...localResult.plugins, ...npmResult.plugins];
    return { plugins: enrichPlugins(all, config), total: all.length };
  }

  /**
   * Get full plugin details.
   * @param id  Package name, optionally prefixed: `local:name` or `npm:name`.
   *            Without prefix, local is tried first then npm.
   */
  async getPluginDetails(id: string): Promise<StorePlugin | null> {
    const { source, name } = parseId(id);
    const config = this.#configLoader.get();

    if (source === 'local') return this.#localDetails(name, config);
    if (source === 'npm') return this.#npmDetails(name, config);
    return (await this.#localDetails(name, config)) ?? this.#npmDetails(name, config);
  }

  /** Get the root directory of a local plugin (for README/icon serving). */
  async getLocalPluginRoot(id: string): Promise<string | null> {
    const { name } = parseId(id);
    const config = this.#configLoader.get();

    const workspaceEntry = config.plugins.find(
      (p) => p.name === name && p.version.startsWith('workspace:')
    );
    if (workspaceEntry) {
      try {
        const resolved = await this.#configLoader.resolvePluginEntry(workspaceEntry);
        return resolved.rootDirectory;
      } catch {
        // Fall through
      }
    }

    const local = await this.#local.findByName(name);
    return local?.rootDir ?? null;
  }

  /** Get the verified plugins list. */
  getVerifiedList(): Promise<VerifiedPluginsList> {
    return this.#verified.getVerifiedList();
  }

  async #localDetails(name: string, config: BrikaConfig): Promise<StorePlugin | null> {
    const configEntry = config.plugins.find((p) => p.name === name);
    const workspaceEntry = configEntry?.version.startsWith('workspace:') ? configEntry : undefined;

    if (workspaceEntry) {
      try {
        const resolved = await this.#configLoader.resolvePluginEntry(workspaceEntry);
        const raw = await Bun.file(`${resolved.rootDirectory}/package.json`).json();
        return this.#buildLocal(PluginPackageSchema.parse(raw), config);
      } catch {
        // Fall through to filesystem scan
      }
    }

    const found = await this.#local.findByName(name);
    if (found) return this.#buildLocal(found.pkg, config);
    return null;
  }

  async #npmDetails(name: string, config: BrikaConfig): Promise<StorePlugin | null> {
    const pkg = await this.#npm.getPackageDetails(name);
    if (!pkg) return null;

    await this.#verified.init();
    const verified = await this.#verified.isVerified(name);
    const verifiedPlugin = verified ? await this.#verified.getVerifiedPlugin(name) : null;

    return {
      name: pkg.name,
      displayName: pkg.displayName,
      version: pkg.version,
      description: pkg.description ?? '',
      author: pkg.author ?? '',
      keywords: pkg.keywords ?? [],
      repository: pkg.repository,
      homepage: pkg.homepage,
      license: pkg.license,
      engines: pkg.engines,
      source: 'npm',
      installVersion: pkg.version,
      verified,
      verifiedAt: verifiedPlugin?.verifiedAt,
      featured: verifiedPlugin?.featured ?? false,
      npm: { downloads: 0, publishedAt: pkg.date ?? '' },
      ...computeEnrichment(pkg, config),
    };
  }

  #buildLocal(pkg: PluginPackageSchema, config: BrikaConfig): StorePlugin {
    return {
      name: pkg.name,
      displayName: pkg.displayName,
      version: pkg.version,
      installVersion: 'workspace:*',
      description: pkg.description ?? '',
      author: pkg.author ?? '',
      keywords: pkg.keywords ?? [],
      repository: pkg.repository,
      homepage: pkg.homepage,
      license: pkg.license,
      engines: pkg.engines,
      verified: false,
      featured: false,
      source: 'local',
      npm: { downloads: 0, publishedAt: '' },
      ...computeEnrichment(pkg, config),
    };
  }
}

/** Parse an optional source prefix from a plugin ID: `local:name` → `{ source: 'local', name }` */
function parseId(id: string): { source: string | null; name: string } {
  const colonIdx = id.indexOf(':');
  if (colonIdx > 0) {
    return { source: id.slice(0, colonIdx), name: id.slice(colonIdx + 1) };
  }
  return { source: null, name: id };
}
