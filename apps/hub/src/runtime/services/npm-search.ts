import { inject, singleton } from '@brika/di';
import { HttpClient } from '@brika/http';
import type { NpmPackageData, NpmSearchResult } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';

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
  'dist-tags': {
    latest: string;
    [tag: string]: string;
  };
  versions: Record<
    string,
    {
      name: string;
      version: string;
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

/**
 * Service for searching npm registry for Brika plugins.
 */
@singleton()
export class NpmSearchService {
  readonly #log = inject(Logger);
  readonly #http = inject(HttpClient);

  /**
   * Search npm for Brika plugins.
   *
   * Searches for packages with 'brika' keyword, then verifies they have engines.brika
   * to ensure they're actually Brika plugins.
   *
   * @param query - Search query string (optional, searches plugin names/descriptions)
   * @param limit - Maximum number of results (default: 20)
   * @param offset - Pagination offset (default: 0)
   * @returns Search results with total count
   */
  async search(
    query?: string,
    limit = 20,
    offset = 0
  ): Promise<{ plugins: NpmSearchResult[]; total: number }> {
    try {
      // Build search query - use scope search or keyword search
      let searchQuery: string;
      if (query) {
        // Search within @brika scope or packages with brika keyword
        searchQuery = `keywords:brika ${query}`;
      } else {
        // Default: all packages with brika keyword
        searchQuery = 'keywords:brika';
      }

      // Fetch more results to account for filtering
      const fetchSize = Math.max(limit * 5, 50);

      this.#log.info('Searching npm registry', { query: searchQuery, limit, offset });

      const data = await this.#http
        .get<NpmApiSearchResult>(NPM_SEARCH_URL)
        .params({
          text: searchQuery,
          size: String(fetchSize),
          from: String(offset),
        })
        .cache({ ttl: 300_000, tags: ['npm-search'] }) // Cache for 5 minutes
        .data();

      // Verify and enrich packages in parallel
      const validatedPlugins = await this.#validateAndEnrichPlugins(data.objects, limit, query);

      // Return actual count of results found
      // If result count equals limit, there may be more results available
      return { plugins: validatedPlugins, total: validatedPlugins.length };
    } catch (error) {
      this.#log.error('npm search failed', { error: String(error) });
      return { plugins: [], total: 0 };
    }
  }

  /**
   * Validate packages are real Brika plugins and enrich with details.
   * Processes packages in parallel for better performance.
   * Also performs client-side filtering if query is provided.
   */
  async #validateAndEnrichPlugins(
    objects: NpmApiSearchResult['objects'],
    limit: number,
    query?: string
  ): Promise<NpmSearchResult[]> {
    const results: NpmSearchResult[] = [];
    const queryLower = query?.toLowerCase();

    // Process in batches to avoid overwhelming npm API
    const BATCH_SIZE = 5;
    for (let i = 0; i < objects.length && results.length < limit; i += BATCH_SIZE) {
      const batch = objects.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (obj) => {
          const packageData = await this.getPackageDetails(obj.package.name);

          // Filter out non-plugins (packages without engines.brika)
          if (!packageData?.engines?.brika) {
            return null;
          }

          // Client-side filtering: if query is provided, ensure it matches
          if (queryLower) {
            const nameMatch = packageData.name.toLowerCase().includes(queryLower);
            const descMatch = packageData.description?.toLowerCase().includes(queryLower);
            const keywordsMatch = packageData.keywords?.some((k) =>
              k.toLowerCase().includes(queryLower)
            );

            // Skip if query doesn't match name, description, or keywords
            if (!nameMatch && !descMatch && !keywordsMatch) {
              return null;
            }
          }

          const downloadCount = await this.#getDownloadCount(obj.package.name);

          return {
            package: {
              ...packageData,
              links: obj.package.links,
              score: obj.score,
            },
            downloadCount,
          };
        })
      );

      // Add valid results
      for (const result of batchResults) {
        if (result && results.length < limit) {
          results.push(result);
        }
      }

      // Early exit if we have enough
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  /**
   * Get detailed package information from npm.
   *
   * @param packageName - Name of the package
   * @returns Package data or null if not found
   */
  async getPackageDetails(packageName: string): Promise<NpmPackageData | null> {
    try {
      const data = await this.#http
        .get<NpmApiPackageResponse>(`${NPM_REGISTRY_URL}/${packageName}`)
        .cache({ ttl: 600_000, tags: ['npm-package'] }) // Cache for 10 minutes
        .data();

      const latestVersion = data['dist-tags']?.latest || Object.keys(data.versions).pop();

      if (!latestVersion) {
        return null;
      }

      const versionData = data.versions[latestVersion];

      return {
        name: data.name,
        version: latestVersion,
        description: versionData.description,
        author: versionData.author,
        keywords: versionData.keywords || [],
        repository: versionData.repository,
        homepage: versionData.homepage,
        license: versionData.license,
        engines: versionData.engines,
        date: data.time?.[latestVersion],
      };
    } catch {
      return null;
    }
  }

  /**
   * Get weekly download count for a package.
   */
  async #getDownloadCount(packageName: string): Promise<number> {
    try {
      const data = await this.#http
        .get<NpmApiDownloads>(`${NPM_DOWNLOADS_URL}/last-week/${packageName}`)
        .cache({ ttl: 3_600_000, tags: ['npm-downloads'] }) // Cache for 1 hour
        .data();

      return data.downloads || 0;
    } catch {
      return 0;
    }
  }
}
