import { inject, singleton } from '@brika/di';
import { HttpClient } from '@brika/http';
import { ConfigLoader } from '@/runtime/config/config-loader';
import {
  type ExternalRegistryLink,
  externalLinkForStore,
  readmeSourceForStore,
} from '@/runtime/config/registries';
import { Logger } from '@/runtime/logs/log-router';
import type { PluginPackageData } from '../types';
import type { RawRegistryPlugin, RegistrySource } from './registry-source';

// Subset of the `/v1` contract this source consumes.
interface V1Author {
  id: string;
  name?: string;
}
interface V1PluginSummary {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  author?: V1Author;
  keywords?: string[];
  downloadsWeekly?: number;
  brikaEngine: string;
  publishedAt?: string;
  /** Resolved icon URL (absolute, or root-relative to the store origin). */
  iconUrl?: string;
}
interface V1PluginDetail extends V1PluginSummary {
  repository?: string;
  homepage?: string;
  license?: string;
  grants?: Record<string, unknown>;
}
interface V1SearchResponse {
  plugins: V1PluginSummary[];
  total: number;
}
interface V1ReadmeResponse {
  readme: string | null;
  filename?: string;
}

/**
 * Federated source over every configured `/v1` store (`config.searchStores`, default the Brika
 * store). Search merges all stores and de-duplicates by package name (earlier store wins). Stores
 * are not scope-bound, so details query each store in turn and return the first hit. A no-op when no
 * store is configured, so the hub falls back to npm.
 */
@singleton()
export class RemoteRegistrySource implements RegistrySource {
  readonly #log = inject(Logger);
  readonly #http = inject(HttpClient);
  readonly #config = inject(ConfigLoader);

  /** Effective `/v1` store base URLs (searchStores ∪ registry-declared); empty before config loads. */
  #stores(): string[] {
    try {
      return this.#config.getSearchStores();
    } catch {
      return [];
    }
  }

  /** The registry catalogue (for plugin-URL templates); empty before config loads. */
  #registries() {
    try {
      return this.#config.get().registries;
    } catch {
      return [];
    }
  }

  /** True when at least one search store is configured. */
  get configured(): boolean {
    return this.#stores().length > 0;
  }

  async search(
    query?: string,
    limit = 20,
    offset = 0
  ): Promise<{
    plugins: RawRegistryPlugin[];
    total: number;
  }> {
    const stores = this.#stores();
    if (stores.length === 0) {
      return { plugins: [], total: 0 };
    }

    const perStore = await Promise.all(
      stores.map((base) => this.#searchStore(base, query, limit, offset))
    );

    // Merge across stores, de-duping by name so the same plugin mirrored on two stores appears once.
    const seen = new Set<string>();
    const plugins: RawRegistryPlugin[] = [];
    for (const summaries of perStore) {
      for (const summary of summaries) {
        if (seen.has(summary.name)) {
          continue;
        }
        seen.add(summary.name);
        plugins.push(this.#toRaw(summary));
      }
    }
    return { plugins, total: plugins.length };
  }

  /** Fetch full package details from the first configured store that has it. Null if none do. */
  async getPackageDetails(packageName: string): Promise<PluginPackageData | null> {
    return (await this.getDetailWithStore(packageName))?.pkg ?? null;
  }

  /**
   * Package details plus the "Open in <store>" link (name + public web URL) of the store that served
   * them. Returns the first configured store that has the package; null if none do.
   */
  async getDetailWithStore(
    packageName: string
  ): Promise<{ pkg: PluginPackageData; external: ExternalRegistryLink } | null> {
    const registries = this.#registries();
    for (const base of this.#stores()) {
      const pkg = await this.#detailFromStore(base, packageName);
      if (pkg) {
        // The link comes from the matching registry's name + `pluginUrl` template
        // (e.g. "Brika Store" → https://store.brika.dev/@brika/plugin-clock).
        return { pkg, external: externalLinkForStore(registries, base, packageName) };
      }
    }
    return null;
  }

  /**
   * Plugin README from the first configured `/v1` store that serves it and whose registry sources
   * README from the store (`readme: v1`); null if none do, so the caller can fall back to the npm CDN.
   * A store whose registry declares `readme: unpkg` is skipped (its assets live on the CDN).
   */
  async getReadme(packageName: string): Promise<{ readme: string; filename: string } | null> {
    const registries = this.#registries();
    for (const base of this.#stores()) {
      if (readmeSourceForStore(registries, base) !== 'v1') {
        continue;
      }
      try {
        const data = await this.#http
          .get<V1ReadmeResponse>(`${base}/v1/plugins/${encodeURIComponent(packageName)}/readme`)
          .cache({ ttl: 600_000, tags: ['remote-readme'] })
          .data();
        if (data.readme) {
          return { readme: data.readme, filename: data.filename ?? 'README.md' };
        }
      } catch {
        // One store missing the README must not stop the others.
      }
    }
    return null;
  }

  /**
   * Absolute icon URL from the first configured `/v1` store (whose registry sources assets from the
   * store) whose detail carries one; null if none do. The `/v1` `iconUrl` may be root-relative, so it
   * is resolved against the store base. A `readme: unpkg` registry is skipped (icon comes from the CDN).
   */
  async getIconUrl(packageName: string): Promise<string | null> {
    const registries = this.#registries();
    for (const base of this.#stores()) {
      if (readmeSourceForStore(registries, base) !== 'v1') {
        continue;
      }
      const detail = await this.#summaryFromStore(base, packageName);
      if (detail?.iconUrl) {
        return new URL(detail.iconUrl, base).toString();
      }
    }
    return null;
  }

  /** Raw `/v1` detail (pre-mapping) for the icon lookup; shares the cached detail fetch. Null on miss. */
  async #summaryFromStore(base: string, packageName: string): Promise<V1PluginDetail | null> {
    try {
      return await this.#http
        .get<V1PluginDetail>(`${base}/v1/plugins/${encodeURIComponent(packageName)}`)
        .cache({ ttl: 600_000, tags: ['remote-package'] })
        .data();
    } catch {
      return null;
    }
  }

  async #searchStore(
    base: string,
    query: string | undefined,
    limit: number,
    offset: number
  ): Promise<V1PluginSummary[]> {
    try {
      const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
      if (query) {
        params.q = query;
      }
      const data = await this.#http
        .get<V1SearchResponse>(`${base}/v1/search`)
        .params(params)
        .cache({ ttl: 300_000, tags: ['remote-search'] })
        .data();
      return data.plugins;
    } catch (error) {
      // One unreachable store must not sink the whole federated search.
      this.#log.error('remote registry search failed', { store: base, error: String(error) });
      return [];
    }
  }

  async #detailFromStore(base: string, packageName: string): Promise<PluginPackageData | null> {
    try {
      const detail = await this.#http
        .get<V1PluginDetail>(`${base}/v1/plugins/${encodeURIComponent(packageName)}`)
        .cache({ ttl: 600_000, tags: ['remote-package'] })
        .data();
      return {
        ...this.#basePackage(detail),
        repository: detail.repository,
        homepage: detail.homepage,
        license: detail.license,
        grants: detail.grants,
      };
    } catch {
      return null;
    }
  }

  #basePackage(plugin: V1PluginSummary): PluginPackageData {
    return {
      name: plugin.name,
      version: plugin.version,
      displayName: plugin.displayName,
      description: plugin.description,
      author: plugin.author ? { name: plugin.author.name ?? plugin.author.id } : undefined,
      keywords: plugin.keywords ?? [],
      engines: { brika: plugin.brikaEngine },
      date: plugin.publishedAt,
    };
  }

  #toRaw(plugin: V1PluginSummary): RawRegistryPlugin {
    return {
      package: this.#basePackage(plugin),
      downloadCount: plugin.downloadsWeekly ?? 0,
      source: 'store',
      installVersion: plugin.version,
    };
  }
}
