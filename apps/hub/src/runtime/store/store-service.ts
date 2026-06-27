import { inject, singleton } from '@brika/di';
import type { VerifiedPluginsList } from '@brika/registry';
import { PluginPackageSchema } from '@brika/schema';
import { type BrikaConfig, ConfigLoader } from '@/runtime/config/config-loader';
import { type ExternalRegistryLink, externalLinkForNpm } from '@/runtime/config/registries';
import { computeEnrichment, enrichPlugins } from './enrich';
import { LocalRegistry } from './sources/local';
import { NpmRegistry } from './sources/npm';
import { RemoteRegistrySource } from './sources/remote';
import type { PluginPackageData, PluginSearchResult, StorePlugin } from './types';
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
  readonly #remote = inject(RemoteRegistrySource);
  readonly #local = inject(LocalRegistry);
  readonly #verified = inject(VerifiedPluginsService);
  readonly #configLoader = inject(ConfigLoader);

  /** Search all registry sources and return combined results (no deduplication). */
  async search(
    query?: string,
    limit = 20,
    offset = 0
  ): Promise<{
    plugins: PluginSearchResult[];
    total: number;
  }> {
    const config = this.#configLoader.get();
    // When a remote store is configured it replaces npm as the discovery source
    // (the store mirrors npm), so results are not duplicated.
    const useRemote = this.#remote.configured;

    const [npmResult, localResult, remoteResult] = await Promise.all([
      useRemote
        ? Promise.resolve({ plugins: [], total: 0 })
        : this.#npm.search(query, limit, offset),
      this.#local.search(query),
      useRemote
        ? this.#remote.search(query, limit, offset)
        : Promise.resolve({ plugins: [], total: 0 }),
    ]);

    const all = [...localResult.plugins, ...remoteResult.plugins, ...npmResult.plugins];
    return {
      plugins: enrichPlugins(all, config),
      total: all.length,
    };
  }

  /**
   * Get full plugin details.
   * @param id  Package name, optionally prefixed: `local:name` or `npm:name`.
   *            Without prefix, local is tried first then npm.
   */
  async getPluginDetails(id: string): Promise<StorePlugin | null> {
    const { source, name } = parseId(id);
    const config = this.#configLoader.get();

    if (source === 'local') {
      return this.#localDetails(name, config);
    }
    if (source === 'npm') {
      return this.#npmDetails(name, config);
    }
    if (source === 'store') {
      return this.#remoteDetails(name, config);
    }

    const local = await this.#localDetails(name, config);
    if (local) {
      return local;
    }
    return this.#remote.configured
      ? this.#remoteDetails(name, config)
      : this.#npmDetails(name, config);
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

  /**
   * Plugin README from a configured `/v1` store (the Brika registry). Returns null when the plugin is
   * explicitly npm/local, no store is configured, or no store serves it, so the route falls back to the
   * npm CDN.
   */
  getRemoteReadme(id: string): Promise<{ readme: string; filename: string } | null> {
    const { source, name } = parseId(id);
    if (source === 'npm' || source === 'local') {
      return Promise.resolve(null);
    }
    return this.#remote.getReadme(name);
  }

  /**
   * Plugin icon URL from a configured `/v1` store (the Brika registry). Returns null when the plugin is
   * explicitly npm/local, no store is configured, or no store serves it, so the route falls back to the
   * npm CDN.
   */
  getRemoteIconUrl(id: string): Promise<string | null> {
    const { source, name } = parseId(id);
    if (source === 'npm' || source === 'local') {
      return Promise.resolve(null);
    }
    return this.#remote.getIconUrl(name);
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
    if (found) {
      return this.#buildLocal(found.pkg, config);
    }
    return null;
  }

  #npmDetails(name: string, config: BrikaConfig): Promise<StorePlugin | null> {
    // The "Open in npm" link comes from the npm registry descriptor's name + pluginUrl template.
    const external = externalLinkForNpm(config.registries, name);
    return this.#detailsFrom(this.#npm.getPackageDetails(name), 'npm', config, external);
  }

  async #remoteDetails(name: string, config: BrikaConfig): Promise<StorePlugin | null> {
    const found = await this.#remote.getDetailWithStore(name);
    if (!found) {
      return null;
    }
    // Carry the serving store's "Open in <store>" link (name + URL) for the UI.
    return this.#detailsFrom(Promise.resolve(found.pkg), 'store', config, found.external);
  }

  async #detailsFrom(
    pending: Promise<PluginPackageData | null>,
    source: string,
    config: BrikaConfig,
    externalRegistry?: ExternalRegistryLink
  ): Promise<StorePlugin | null> {
    const pkg = await pending;
    if (!pkg) {
      return null;
    }

    await this.#verified.init();
    const verified = await this.#verified.isVerified(pkg.name);
    const verifiedPlugin = verified ? await this.#verified.getVerifiedPlugin(pkg.name) : null;

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
      grants: pkg.grants,
      source,
      externalRegistry,
      installVersion: pkg.version,
      verified,
      verifiedAt: verifiedPlugin?.verifiedAt,
      featured: verifiedPlugin?.featured ?? false,
      npm: {
        downloads: 0,
        publishedAt: pkg.date ?? '',
      },
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
      grants: pkg.grants,
      verified: false,
      featured: false,
      source: 'local',
      npm: {
        downloads: 0,
        publishedAt: '',
      },
      ...computeEnrichment(pkg, config),
    };
  }
}

/** Parse an optional source prefix from a plugin ID: `local:name` → `{ source: 'local', name }` */
function parseId(id: string): {
  source: string | null;
  name: string;
} {
  const colonIdx = id.indexOf(':');
  if (colonIdx > 0) {
    return {
      source: id.slice(0, colonIdx),
      name: id.slice(colonIdx + 1),
    };
  }
  return {
    source: null,
    name: id,
  };
}
