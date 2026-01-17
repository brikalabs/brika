import type { NpmPackageData, NpmSearchResult } from '@brika/shared';
import { singleton } from '@brika/shared';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedResult<T> {
  data: T;
  timestamp: number;
}

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
 * Implements caching to avoid rate limiting.
 */
@singleton()
export class NpmSearchService {
  readonly #cache = new Map<string, CachedResult<unknown>>();

  /**
   * Search npm for Brika plugins.
   *
   * Uses a multi-strategy approach:
   * 1. Primary: Search for packages that depend on @brika/sdk (most reliable)
   * 2. Secondary: Also include packages with 'brika-plugin' keyword
   *
   * This ensures we find all plugins, even if authors forget to add the keyword.
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
    const cacheKey = `search:${query || ''}:${limit}:${offset}`;
    const cached = this.#getFromCache<{ plugins: NpmSearchResult[]; total: number }>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      // Build search query - Use hybrid approach for reliability
      // 1. Search for packages in @brika scope OR with brika keyword
      // 2. Filter by dependency on backend (npm's dependency search doesn't work well with scoped packages)
      const searchTerms = [];

      // Search broadly for brika-related packages
      if (query) {
        // If user provides query, combine it with brika keyword
        searchTerms.push(`keywords:brika ${query}`);
      } else {
        // Default: search for all packages with brika keyword
        searchTerms.push('keywords:brika');
      }

      const searchQuery = searchTerms.join(' ');
      const url = `${NPM_SEARCH_URL}?text=${encodeURIComponent(searchQuery)}&size=${limit * 2}&from=${offset}`;

      console.log(`Searching npm: ${searchQuery}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`npm search failed: ${response.statusText}`);
      }

      const data = (await response.json()) as NpmApiSearchResult;

      // Filter and enrich results - only include packages that depend on @brika/sdk
      const pluginResults = [];

      for (const obj of data.objects) {
        // Verify this package actually depends on @brika/sdk
        const packageData = await this.getPackageDetails(obj.package.name);

        if (!packageData) {
          continue;
        }

        // Check if package depends on @brika/sdk (in dependencies or peerDependencies)
        const hasSdkDependency = packageData.engines?.brika !== undefined; // packages with engines.brika are plugins

        if (!hasSdkDependency) {
          continue; // Skip non-plugin packages
        }

        const downloadCount = await this.#getDownloadCount(obj.package.name);

        pluginResults.push({
          package: {
            ...packageData,
            links: obj.package.links,
            score: obj.score,
          },
          downloadCount,
        });

        // Stop if we have enough results
        if (pluginResults.length >= limit) {
          break;
        }
      }

      const result = { plugins: pluginResults, total: pluginResults.length };
      this.#setCache(cacheKey, result);

      return result;
    } catch (error) {
      console.error('npm search error:', error);
      return { plugins: [], total: 0 };
    }
  }

  /**
   * Get detailed package information from npm.
   *
   * @param packageName - Name of the package
   * @returns Package data or null if not found
   */
  async getPackageDetails(packageName: string): Promise<NpmPackageData | null> {
    const cacheKey = `package:${packageName}`;
    const cached = this.#getFromCache<NpmPackageData>(cacheKey);

    if (cached) {
      return cached;
    }

    try {
      const url = `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`npm package fetch failed: ${response.statusText}`);
      }

      const data = (await response.json()) as NpmApiPackageResponse;
      const latestVersion = data['dist-tags']?.latest || Object.keys(data.versions).pop();

      if (!latestVersion) {
        return null;
      }

      const versionData = data.versions[latestVersion];

      const packageData: NpmPackageData = {
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

      this.#setCache(cacheKey, packageData);
      return packageData;
    } catch (error) {
      console.error(`npm package fetch error for ${packageName}:`, error);
      return null;
    }
  }

  /**
   * Get weekly download count for a package.
   */
  async #getDownloadCount(packageName: string): Promise<number> {
    const cacheKey = `downloads:${packageName}`;
    const cached = this.#getFromCache<number>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    try {
      const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`;
      const response = await fetch(url);

      if (!response.ok) {
        return 0;
      }

      const data = (await response.json()) as NpmApiDownloads;
      const count = data.downloads || 0;

      this.#setCache(cacheKey, count);
      return count;
    } catch (error) {
      console.error(`npm downloads fetch error for ${packageName}:`, error);
      return 0;
    }
  }

  /**
   * Get cached value if not expired.
   */
  #getFromCache<T>(key: string): T | null {
    const cached = this.#cache.get(key) as CachedResult<T> | undefined;

    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;

    if (age > CACHE_TTL_MS) {
      this.#cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set value in cache with timestamp.
   */
  #setCache<T>(key: string, data: T): void {
    this.#cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }
}
