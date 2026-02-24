import { inject, singleton } from '@brika/di';
import {
  canonicalize,
  REGISTRY_PUBLIC_KEY,
  type VerifiedPlugin,
  type VerifiedPluginsList,
  verifyWithRawKey,
} from '@brika/registry';
import { Logger } from '@/runtime/logs/log-router';

// Configuration
const REGISTRY_URL = process.env.BRIKA_REGISTRY || 'https://registry.brika.dev';
const PINNED_PUBLIC_KEY = process.env.BRIKA_REGISTRY_PUBLIC_KEY ?? REGISTRY_PUBLIC_KEY;

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Service for managing verified plugins list.
 * Fetches from the registry service (CDN in production, configurable via BRIKA_REGISTRY).
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
   * Fetch verified plugins list from the registry service.
   */
  async #fetchVerifiedList(): Promise<void> {
    try {
      this.#log.info('Fetching verified plugins list', { url: REGISTRY_URL });
      const response = await fetch(`${REGISTRY_URL}/verified-plugins.json`, {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch verified plugins: ${response.statusText}`);
      }

      const data = (await response.json()) as VerifiedPluginsList;

      // Validate the response structure
      if (!data.plugins || !Array.isArray(data.plugins)) {
        throw new Error('Invalid verified plugins list format');
      }

      // Verify registry signature if present
      if (data.signature && data.publicKey) {
        const verified = this.#verifyRegistrySignature(data);
        if (!verified) {
          throw new Error('Registry signature verification failed');
        }
        this.#log.info('Registry signature verified');
      } else if (PINNED_PUBLIC_KEY) {
        this.#log.warn('Registry response is unsigned but a pinned key is configured');
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

      // Use empty list if fetch failed
      this.#verifiedList = {
        plugins: [],
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
      };
      this.#lastFetch = Date.now();
    }
  }

  /**
   * Verify the Ed25519 signature of the registry data.
   * Returns true if signature is valid, false otherwise.
   */
  #verifyRegistrySignature(data: VerifiedPluginsList): boolean {
    if (!data.publicKey || !data.signature) return false;

    // If a pinned key is configured, ensure it matches
    if (PINNED_PUBLIC_KEY && data.publicKey !== PINNED_PUBLIC_KEY) {
      this.#log.error('Registry public key does not match pinned key');
      return false;
    }

    // Build the signable payload (everything except $schema and signature)
    const signable = {
      version: data.version,
      lastUpdated: data.lastUpdated,
      publicKey: data.publicKey,
      plugins: data.plugins,
    };

    return verifyWithRawKey(canonicalize(signable), data.signature, data.publicKey);
  }

  /**
   * Force refresh the verified plugins list.
   */
  async refresh(): Promise<void> {
    this.#lastFetch = 0; // Reset to force fetch
    await this.init();
  }
}
