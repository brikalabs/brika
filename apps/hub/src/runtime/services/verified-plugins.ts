import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VerifiedPlugin, VerifiedPluginsList } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';

// Configuration
const REGISTRY_URL = process.env.BRIKA_REGISTRY || 'https://registry.brika.dev';
const VERIFIED_PLUGINS_PATH = join(process.cwd(), '..', 'registry', 'verified-plugins.json');
const USE_LOCAL_FILE = process.env.NODE_ENV === 'development' || !process.env.BRIKA_REGISTRY;

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Service for managing verified plugins list.
 * In development: reads from local file (apps/registry/verified-plugins.json)
 * In production: fetches from CDN (registry.brika.dev)
 */
@singleton()
export class VerifiedPluginsService {
  readonly #log = inject(Logger);
  #verifiedList: VerifiedPluginsList | null = null;
  readonly #verifiedMap = new Map<string, VerifiedPlugin>();
  #lastFetch: number = 0;
  #fetchPromise: Promise<void> | null = null;

  /**
   * Initialize the service by fetching the verified plugins list.
   * Safe to call multiple times - will use cached data if fresh.
   */
  async init(): Promise<void> {
    // If we have fresh data, return immediately
    if (this.#verifiedList && Date.now() - this.#lastFetch < REFRESH_INTERVAL_MS) {
      return;
    }

    // If a fetch is already in progress, wait for it
    if (this.#fetchPromise) {
      await this.#fetchPromise;
      return;
    }

    // Start a new fetch
    this.#fetchPromise = this.#fetchVerifiedList();
    await this.#fetchPromise;
    this.#fetchPromise = null;
  }

  /**
   * Get the complete verified plugins list.
   * Automatically refreshes if data is stale.
   */
  async getVerifiedList(): Promise<VerifiedPluginsList> {
    await this.init();

    if (!this.#verifiedList) {
      // Return empty list if fetch failed
      return {
        plugins: [],
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
      };
    }

    return this.#verifiedList;
  }

  /**
   * Check if a plugin is verified.
   *
   * @param packageName - Name of the package to check
   * @returns true if verified, false otherwise
   */
  async isVerified(packageName: string): Promise<boolean> {
    await this.init();
    return this.#verifiedMap.has(packageName);
  }

  /**
   * Get verified plugin details.
   *
   * @param packageName - Name of the package
   * @returns Verified plugin data or null if not verified
   */
  async getVerifiedPlugin(packageName: string): Promise<VerifiedPlugin | null> {
    await this.init();
    return this.#verifiedMap.get(packageName) || null;
  }

  /**
   * Get all featured plugins.
   */
  async getFeaturedPlugins(): Promise<VerifiedPlugin[]> {
    await this.init();
    return Array.from(this.#verifiedMap.values()).filter((p) => p.featured);
  }

  /**
   * Fetch verified plugins list from local file or CDN.
   */
  async #fetchVerifiedList(): Promise<void> {
    try {
      let data: VerifiedPluginsList;

      if (USE_LOCAL_FILE) {
        // Development: read from local file
        this.#log.info('Loading verified plugins list from local file', {
          path: VERIFIED_PLUGINS_PATH,
        });
        const fileContent = await readFile(VERIFIED_PLUGINS_PATH, 'utf-8');
        data = JSON.parse(fileContent) as VerifiedPluginsList;
      } else {
        // Production: fetch from CDN
        this.#log.info('Fetching verified plugins list from CDN', { url: REGISTRY_URL });
        const response = await fetch(`${REGISTRY_URL}/verified-plugins.json`, {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch verified plugins: ${response.statusText}`);
        }

        data = (await response.json()) as VerifiedPluginsList;
      }

      // Validate the response structure
      if (!data.plugins || !Array.isArray(data.plugins)) {
        throw new Error('Invalid verified plugins list format');
      }

      this.#verifiedList = data;
      this.#lastFetch = Date.now();

      // Build lookup map
      this.#verifiedMap.clear();
      for (const plugin of data.plugins) {
        this.#verifiedMap.set(plugin.name, plugin);
      }

      this.#log.info('Loaded verified plugins', { count: data.plugins.length });
    } catch (error) {
      this.#log.error('Failed to load verified plugins list', { error: String(error) });

      // Use empty list if file doesn't exist or is invalid
      this.#verifiedList = {
        plugins: [],
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
      };
      this.#lastFetch = Date.now();
    }
  }

  /**
   * Force refresh the verified plugins list.
   */
  async refresh(): Promise<void> {
    this.#lastFetch = 0; // Reset to force fetch
    await this.init();
  }
}
