import type { PluginHealth, PluginManifest, Rule, Schedule } from '@brika/shared';
import { inject, PluginManifestSchema, singleton } from '@brika/shared';
import { HubConfig } from '@/runtime/config';
import { LogRouter } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persisted plugin state - only runtime state, no metadata duplication.
 * Metadata is loaded from package.json and cached in memory.
 */
export interface InstalledPluginState {
  ref: string;
  /** Installation directory */
  dir: string;
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
  name: string;
  version: string;
  metadata: PluginManifest;
}

type StateFile = {
  plugins: Record<string, InstalledPluginState>;
  schedules: Record<string, Schedule>;
  rules: Record<string, Rule>;
};

@singleton()
export class StateStore {
  private readonly config = inject(HubConfig);
  private readonly logs = inject(LogRouter);
  readonly #homeDir: string;
  readonly #file: string;
  #state: StateFile = { plugins: {}, schedules: {}, rules: {} };

  /** In-memory cache of plugin metadata loaded from package.json files */
  readonly #metadataCache = new Map<string, PluginManifest>();

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

    // Handle migration from old format
    const plugins: Record<string, InstalledPluginState> = {};
    let needsMigration = false;

    for (const [oldRef, p] of Object.entries(parsed.plugins ?? {})) {
      // Migrate old ref formats to new format (package names or file: paths)
      const newRef = this.#migrateRef(oldRef);
      if (newRef !== oldRef) needsMigration = true;

      plugins[newRef] = {
        ref: newRef,
        dir: p.dir,
        uid: p.uid,
        enabled: p.enabled,
        health: p.health,
        lastError: p.lastError,
        updatedAt: p.updatedAt,
      };
    }

    this.#state = {
      plugins,
      schedules: parsed.schedules ?? {},
      rules: parsed.rules ?? {},
    };

    // Persist migrated state if changes were made
    if (needsMigration) {
      await this.#flush();
    }
  }

  /**
   * Load metadata cache for all installed plugins.
   * Should be called once at startup before accessing plugins.
   */
  async loadMetadataCache(): Promise<void> {
    for (const p of Object.values(this.#state.plugins)) {
      await this.refreshMetadata(p.ref, p.dir);
    }
  }

  /**
   * Refresh metadata for a specific plugin from its package.json.
   */
  async refreshMetadata(ref: string, dir: string): Promise<PluginManifest> {
    const metadata = await this.#readPackageJson(dir);
    this.#metadataCache.set(ref, metadata);
    return metadata;
  }

  /**
   * Get cached metadata for a plugin.
   */
  getMetadata(ref: string): PluginManifest | undefined {
    return this.#metadataCache.get(ref);
  }

  listInstalled(): InstalledPluginState[] {
    return Object.values(this.#state.plugins);
  }

  /**
   * List all installed plugins with their cached metadata.
   */
  listInstalledWithMetadata(): PluginStateWithMetadata[] {
    return Object.values(this.#state.plugins).map((p) => this.#withMetadata(p));
  }

  get(ref: string): InstalledPluginState | undefined {
    return this.#state.plugins[ref];
  }

  /**
   * Get plugin state with cached metadata.
   */
  getWithMetadata(ref: string): PluginStateWithMetadata | undefined {
    const p = this.#state.plugins[ref];
    if (!p) return undefined;
    return this.#withMetadata(p);
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
    return this.#withMetadata(p);
  }

  /** Remove a plugin entry from state (used to clean up stale entries) */
  async remove(ref: string): Promise<void> {
    delete this.#state.plugins[ref];
    await this.#flush();
  }

  async upsert(p: InstalledPluginState): Promise<void> {
    this.#state.plugins[p.ref] = p;
    await this.#flush();
  }

  async setEnabled(ref: string, enabled: boolean): Promise<void> {
    const cur = this.#state.plugins[ref];
    if (!cur) return; // Plugin must be registered first
    cur.enabled = enabled;
    cur.updatedAt = Date.now();
    this.#state.plugins[ref] = cur;
    await this.#flush();
  }

  async setHealth(ref: string, health: PluginHealth, lastError?: string | null): Promise<void> {
    const cur = this.#state.plugins[ref];
    if (!cur) return; // Plugin must be registered first
    cur.health = health;
    cur.lastError = lastError ?? cur.lastError ?? null;
    cur.updatedAt = Date.now();
    this.#state.plugins[ref] = cur;
    await this.#flush();
  }

  /**
   * Register or update a plugin.
   * Only stores runtime state - metadata is cached separately.
   */
  async registerPlugin(info: {
    ref: string;
    dir: string;
    uid: string;
    enabled?: boolean;
  }): Promise<void> {
    const cur = this.#state.plugins[info.ref];
    this.#state.plugins[info.ref] = {
      ref: info.ref,
      dir: info.dir,
      uid: info.uid,
      enabled: info.enabled ?? cur?.enabled ?? true,
      health: 'restarting', // Will be set to 'running' when plugin sends hello
      lastError: null,
      updatedAt: Date.now(),
    };
    await this.#flush();
  }

  // Schedules
  listSchedules(): Schedule[] {
    return Object.values(this.#state.schedules);
  }

  getSchedule(id: string): Schedule | undefined {
    return this.#state.schedules[id];
  }

  async upsertSchedule(s: Schedule): Promise<void> {
    this.#state.schedules[s.id] = s;
    await this.#flush();
  }

  async deleteSchedule(id: string): Promise<void> {
    delete this.#state.schedules[id];
    await this.#flush();
  }

  // Rules
  listRules(): Rule[] {
    return Object.values(this.#state.rules);
  }

  getRule(id: string): Rule | undefined {
    return this.#state.rules[id];
  }

  async upsertRule(r: Rule): Promise<void> {
    this.#state.rules[r.id] = r;
    await this.#flush();
  }

  async deleteRule(id: string): Promise<void> {
    delete this.#state.rules[id];
    await this.#flush();
  }

  /**
   * Sync state to match config entries.
   * Removes state entries for plugins not in config.
   */
  async syncToConfig(validNames: Set<string>): Promise<void> {
    const toRemove: string[] = [];

    for (const plugin of this.listInstalled()) {
      const metadata = this.getMetadata(plugin.ref);
      const name = metadata?.name ?? plugin.ref;

      if (!validNames.has(name)) {
        this.logs.info('state.sync.remove', { ref: plugin.ref, name });
        toRemove.push(plugin.ref);
      }
    }

    for (const ref of toRemove) {
      await this.remove(ref);
    }
  }

  /**
   * Migrate old ref formats to new format.
   * - npm:package → package
   * - workspace:name → file:./plugins/name/src/index.ts (or keep as-is if it resolves)
   * - git:... → removed (unsupported)
   * - file:path → file:path (unchanged)
   * - package-name → package-name (unchanged)
   */
  #migrateRef(ref: string): string {
    // Remove npm: prefix - just use package name
    if (ref.startsWith('npm:')) {
      return ref.slice(4);
    }

    // workspace: refs should be converted to file: refs for local dev
    // or removed if they were pointing to packages that should now be installed via registry
    if (ref.startsWith('workspace:')) {
      const name = ref.slice('workspace:'.length);
      // Convert to file ref pointing to local plugins directory
      return `file:./plugins/${name}/src/index.ts`;
    }

    // git: refs are no longer supported - they should be installed via registry
    if (ref.startsWith('git:')) {
      // Return empty to signal removal, or keep for manual cleanup
      return ref; // Keep for now, will fail to load and user can fix
    }

    // file: and bare package names stay as-is
    return ref;
  }

  #withMetadata(p: InstalledPluginState): PluginStateWithMetadata {
    const metadata = this.#metadataCache.get(p.ref) ?? { name: 'unknown', version: '0.0.0' };
    return {
      ...p,
      name: metadata.name,
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
  async #readPackageJson(pluginDir: string): Promise<PluginManifest> {
    const pkgPath = `${pluginDir}/package.json`;
    const basename = pluginDir.substring(pluginDir.lastIndexOf('/') + 1);

    try {
      const pkg = await import(pkgPath, { with: { type: 'json' } });
      const data = pkg.default ?? pkg;
      const result = PluginManifestSchema.safeParse(data);

      if (!result.success) {
        this.logs.warn('plugin.manifest.invalid', {
          dir: pluginDir,
          errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        });
        return { name: data.name || basename, version: data.version || '0.0.0' };
      }

      return result.data;
    } catch (error) {
      this.logs.warn('plugin.manifest.readError', { dir: pluginDir, error: String(error) });
      return { name: basename, version: '0.0.0' };
    }
  }
}
