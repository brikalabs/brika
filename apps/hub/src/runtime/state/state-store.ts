import { PluginPackageSchema } from '@brika/schema';
import type { PluginHealth } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persisted plugin state - only runtime state, no metadata duplication.
 * Metadata is loaded from package.json and cached in memory.
 */
export interface InstalledPluginState {
  /** Plugin name from package.json (primary identifier) */
  name: string;
  /** Plugin root directory */
  rootDirectory: string;
  /** Entry point file path */
  entryPoint: string;
  /** Short unique ID (stable across restarts) */
  uid: string;
  enabled: boolean;
  health: PluginHealth;
  lastError: string | null;
  updatedAt: number;
}

/**
 * Plugin state combined with cached metadata for API responses.
 */
export interface PluginStateWithMetadata extends InstalledPluginState {
  version: string;
  metadata: PluginPackageSchema;
}

type StateFile = {
  plugins: Record<string, InstalledPluginState>;
};

@singleton()
export class StateStore {
  private readonly config = inject(HubConfig);
  private readonly logs = inject(Logger);
  readonly #homeDir: string;
  readonly #file: string;
  #state: StateFile = { plugins: {} };

  /** In-memory cache of plugin metadata loaded from package.json files */
  readonly #metadataCache = new Map<string, PluginPackageSchema>();

  constructor() {
    this.#homeDir = this.config.homeDir;
    this.#file = `${this.#homeDir}/state.json`;
  }

  async init(): Promise<void> {
    await Bun.write(Bun.file(`${this.#homeDir}/.keep`), '');
    const file = Bun.file(this.#file);
    if (!(await file.exists())) {
      await this.#flush();
      return;
    }
    const parsed = JSON.parse(await file.text()) as Partial<StateFile>;

    this.#state = {
      plugins: parsed.plugins ?? {},
    };
  }

  /**
   * Load metadata cache for all installed plugins.
   * Should be called once at startup before accessing plugins.
   */
  async loadMetadataCache(): Promise<void> {
    for (const p of Object.values(this.#state.plugins)) {
      await this.refreshMetadata(p.name, p.rootDirectory);
    }
  }

  /**
   * Refresh metadata for a specific plugin from its package.json.
   */
  async refreshMetadata(name: string, rootDirectory: string): Promise<PluginPackageSchema> {
    const metadata = await this.#readPackageJson(rootDirectory);
    this.#metadataCache.set(name, metadata);
    return metadata;
  }

  /**
   * Get cached metadata for a plugin.
   */
  getMetadata(name: string): PluginPackageSchema | undefined {
    return this.#metadataCache.get(name);
  }

  listInstalled(): InstalledPluginState[] {
    return Object.values(this.#state.plugins);
  }

  /**
   * List all installed plugins with their cached metadata.
   */
  listInstalledWithMetadata(): PluginStateWithMetadata[] {
    return Object.values(this.#state.plugins)
      .map((p) => this.#withMetadata(p))
      .filter((p): p is PluginStateWithMetadata => p !== null);
  }

  get(name: string): InstalledPluginState | undefined {
    return this.#state.plugins[name];
  }

  /**
   * Get plugin state with cached metadata.
   */
  getWithMetadata(name: string): PluginStateWithMetadata | undefined {
    const p = this.#state.plugins[name];
    if (!p) return undefined;
    return this.#withMetadata(p) ?? undefined;
  }

  /** Get plugin by UID */
  getByUid(uid: string): InstalledPluginState | undefined {
    return Object.values(this.#state.plugins).find((p) => p.uid === uid);
  }

  /**
   * Get plugin by UID with cached metadata.
   */
  getByUidWithMetadata(uid: string): PluginStateWithMetadata | undefined {
    const p = Object.values(this.#state.plugins).find((p) => p.uid === uid);
    if (!p) return undefined;
    return this.#withMetadata(p) ?? undefined;
  }

  /** Remove a plugin entry from state (used to clean up stale entries) */
  async remove(name: string): Promise<void> {
    delete this.#state.plugins[name];
    await this.#flush();
  }

  async upsert(p: InstalledPluginState): Promise<void> {
    this.#state.plugins[p.name] = p;
    await this.#flush();
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    const cur = this.#state.plugins[name];
    if (!cur) return; // Plugin must be registered first
    cur.enabled = enabled;
    cur.updatedAt = Date.now();
    this.#state.plugins[name] = cur;
    await this.#flush();
  }

  async setHealth(name: string, health: PluginHealth, lastError?: string | null): Promise<void> {
    const cur = this.#state.plugins[name];
    if (!cur) return; // Plugin must be registered first
    cur.health = health;
    cur.lastError = lastError ?? cur.lastError ?? null;
    cur.updatedAt = Date.now();
    this.#state.plugins[name] = cur;
    await this.#flush();
  }

  /**
   * Register or update a plugin.
   * Only stores runtime state - metadata is cached separately.
   */
  async registerPlugin(info: {
    name: string;
    rootDirectory: string;
    entryPoint: string;
    uid: string;
    enabled?: boolean;
  }): Promise<void> {
    const cur = this.#state.plugins[info.name];
    this.#state.plugins[info.name] = {
      name: info.name,
      rootDirectory: info.rootDirectory,
      entryPoint: info.entryPoint,
      uid: info.uid,
      enabled: info.enabled ?? cur?.enabled ?? true,
      health: 'restarting', // Will be set to 'running' when plugin sends hello
      lastError: null,
      updatedAt: Date.now(),
    };
    await this.#flush();

    // Load metadata into cache
    await this.refreshMetadata(info.name, info.rootDirectory);
  }

  /**
   * Sync state to match config entries.
   * Removes state entries for plugins not in config.
   */
  async syncToConfig(validNames: Set<string>): Promise<void> {
    const toRemove: string[] = [];

    for (const plugin of this.listInstalled()) {
      if (!validNames.has(plugin.name)) {
        this.logs.info('state.sync.remove', { name: plugin.name });
        toRemove.push(plugin.name);
      }
    }

    for (const name of toRemove) {
      await this.remove(name);
    }
  }

  #withMetadata(p: InstalledPluginState): PluginStateWithMetadata | null {
    const metadata = this.#metadataCache.get(p.name);
    if (!metadata) {
      this.logs.warn('state.metadata.missing', { name: p.name });
      return null;
    }
    return {
      ...p,
      version: metadata.version,
      metadata,
    };
  }

  async #flush(): Promise<void> {
    await Bun.write(this.#file, JSON.stringify(this.#state, null, 2));
  }

  /**
   * Read and validate plugin metadata from package.json.
   */
  async #readPackageJson(pluginDir: string): Promise<PluginPackageSchema> {
    return PluginPackageSchema.parse(
      await import(`${pluginDir}/package.json`, { with: { type: 'json' } })
    );
  }
}
