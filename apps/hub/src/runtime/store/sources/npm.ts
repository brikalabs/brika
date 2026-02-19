import { inject, singleton } from '@brika/di';
import { HttpClient } from '@brika/http';
import type { PluginPackageData } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';
import type { RawRegistryPlugin, RegistrySource } from './registry-source';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const NPM_DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point';

interface NpmApiSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description?: string;
      author?: string | { name: string; email?: string };
      keywords?: string[];
      links?: {
        npm?: string;
        homepage?: string;
        repository?: string;
        bugs?: string;
      };
      date?: string;
    };
    score?: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
  }>;
  total: number;
}

interface NpmApiDownloads {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

interface NpmApiPackageResponse {
  name: string;
  'dist-tags': { latest: string; [tag: string]: string };
  versions: Record<
    string,
    {
      name: string;
      version: string;
      displayName?: string;
      description?: string;
      author?: string | { name: string; email?: string };
      keywords?: string[];
      repository?: string | { type?: string; url: string; directory?: string };
      homepage?: string;
      license?: string;
      engines?: { brika?: string; node?: string };
    }
  >;
  time: Record<string, string>;
}

/** Registry source for the npm public registry. */
@singleton()
export class NpmRegistry implements RegistrySource {
  readonly #log = inject(Logger);
  readonly #http = inject(HttpClient);

  async search(
    query?: string,
    limit = 20,
    offset = 0
  ): Promise<{ plugins: RawRegistryPlugin[]; total: number }> {
    try {
      const searchQuery = query ? `keywords:brika ${query}` : 'keywords:brika';
      const fetchSize = Math.max(limit * 5, 50);

      this.#log.info('Searching npm registry', { query: searchQuery, limit, offset });

      const data = await this.#http
        .get<NpmApiSearchResult>(NPM_SEARCH_URL)
        .params({ text: searchQuery, size: String(fetchSize), from: String(offset) })
        .cache({ ttl: 300_000, tags: ['npm-search'] }) // 5 minutes
        .data();

      const plugins = await this.#validateAndFetchDetails(data.objects, limit, query);
      return { plugins, total: plugins.length };
    } catch (error) {
      this.#log.error('npm search failed', { error: String(error) });
      return { plugins: [], total: 0 };
    }
  }

  /** Get detailed package information from npm. Returns null if not found. */
  async getPackageDetails(packageName: string): Promise<PluginPackageData | null> {
    try {
      const data = await this.#http
        .get<NpmApiPackageResponse>(`${NPM_REGISTRY_URL}/${packageName}`)
        .cache({ ttl: 600_000, tags: ['npm-package'] }) // 10 minutes
        .data();

      const latestVersion = data['dist-tags']?.latest || Object.keys(data.versions).pop();
      if (!latestVersion) return null;

      const v = data.versions[latestVersion];
      return {
        name: data.name,
        version: latestVersion,
        displayName: v.displayName,
        description: v.description,
        author: v.author,
        keywords: v.keywords || [],
        repository: v.repository,
        homepage: v.homepage,
        license: v.license,
        engines: v.engines,
        date: data.time?.[latestVersion],
      };
    } catch {
      return null;
    }
  }

  async #validateAndFetchDetails(
    objects: NpmApiSearchResult['objects'],
    limit: number,
    query?: string
  ): Promise<RawRegistryPlugin[]> {
    const results: RawRegistryPlugin[] = [];
    const queryLower = query?.toLowerCase();

    const BATCH_SIZE = 5;
    for (let i = 0; i < objects.length && results.length < limit; i += BATCH_SIZE) {
      const batch = objects.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (obj) => {
          const pkg = await this.getPackageDetails(obj.package.name);
          if (!pkg?.engines?.brika) return null;

          if (queryLower) {
            const matches =
              pkg.name.toLowerCase().includes(queryLower) ||
              pkg.description?.toLowerCase().includes(queryLower) ||
              pkg.keywords?.some((k) => k.toLowerCase().includes(queryLower));
            if (!matches) return null;
          }

          const downloadCount = await this.#getDownloadCount(obj.package.name);
          return {
            package: { ...pkg, links: obj.package.links, score: obj.score },
            downloadCount,
            source: 'npm',
            installVersion: pkg.version,
          };
        })
      );

      for (const result of batchResults) {
        if (result && results.length < limit) results.push(result);
      }

      if (results.length >= limit) break;
    }

    return results;
  }

  async #getDownloadCount(packageName: string): Promise<number> {
    try {
      const data = await this.#http
        .get<NpmApiDownloads>(`${NPM_DOWNLOADS_URL}/last-week/${packageName}`)
        .cache({ ttl: 3_600_000, tags: ['npm-downloads'] }) // 1 hour
        .data();
      return data.downloads || 0;
    } catch {
      return 0;
    }
  }
}
