/**
 * BRIKA Configuration Loader
 *
 * Loads and validates brika.yml configuration
 */

import { inject, singleton } from '@brika/shared';
import YAML from 'yaml';
import { BrikaInitializer } from './brika-initializer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plugin entry in the new package.json-like format.
 * Key is package name, value is version specifier.
 */
export interface PluginEntry {
  /** Package name (e.g., "@brika/plugin-timer", "timer") */
  name: string;
  /** Version specifier (e.g., "^1.0.0", "workspace:./plugins/timer") */
  specifier: string;
}

export interface RuleEntry {
  name: string;
  event: string;
  condition: string;
  action: { tool: string; args: Record<string, unknown> };
  enabled: boolean;
}

export interface ScheduleEntry {
  name: string;
  trigger: { type: 'cron'; expr: string } | { type: 'interval'; ms: number };
  action: { tool: string; args: Record<string, unknown> };
  enabled: boolean;
}

export interface BrikaConfig {
  hub: {
    port: number;
    host: string;
  };
  plugins: {
    installDir: string;
    heartbeatInterval: number;
    heartbeatTimeout: number;
  };
  install: PluginEntry[];
  rules: RuleEntry[];
  schedules: ScheduleEntry[];
}

const DEFAULT_CONFIG: BrikaConfig = {
  hub: { port: 3001, host: '0.0.0.0' },
  plugins: {
    installDir: './plugins/.installed',
    heartbeatInterval: 5000,
    heartbeatTimeout: 15000,
  },
  install: [],
  rules: [],
  schedules: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Config Loader
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class ConfigLoader {
  readonly #init = inject(BrikaInitializer);

  private config: BrikaConfig | null = null;

  private get configPath(): string {
    return `${this.#init.brikaDir}/brika.yml`;
  }

  private get rootDir(): string {
    return this.#init.rootDir;
  }

  private get brikaDir(): string {
    return this.#init.brikaDir;
  }

  async load(): Promise<BrikaConfig> {
    if (this.config) return this.config;

    try {
      const file = Bun.file(this.configPath);
      const fileExists = await file.exists();

      if (!fileExists) {
        console.log(`[config] No brika.yml found at ${this.configPath}, using defaults`);
        this.config = DEFAULT_CONFIG;
        return this.config;
      }

      const content = await file.text();
      const parsed = YAML.parse(content) as Record<string, unknown>;

      // Parse install section - can be new format (Record) or legacy format (Array)
      const installEntries = this.#parseInstallSection(parsed.install);

      this.config = {
        ...this.merge(DEFAULT_CONFIG, parsed as Partial<BrikaConfig>),
        install: installEntries,
      };

      console.log(`[config] Loaded from ${this.configPath}`);
      return this.config;
    } catch (error) {
      console.error(`[config] Failed to load: ${error}`);
      this.config = DEFAULT_CONFIG;
      return this.config;
    }
  }

  get(): BrikaConfig {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getBrikaDir(): string {
    return this.brikaDir;
  }

  /**
   * Save the current config to brika.yml
   * Preserves comments and formatting by parsing existing YAML as Document
   */
  async save(config?: BrikaConfig): Promise<void> {
    const configToSave = config ?? this.config;
    if (!configToSave) {
      throw new Error('No config to save. Call load() first or provide a config.');
    }

    // Convert install entries back to object format for YAML
    const installObj: Record<string, string> = {};
    for (const entry of configToSave.install) {
      installObj[entry.name] = entry.specifier;
    }

    // Read existing file to preserve comments
    const file = Bun.file(this.configPath);
    let doc: YAML.Document;

    if (await file.exists()) {
      const content = await file.text();
      // Try to parse as YAML document (preserves comments)
      try {
        doc = YAML.parseDocument(content);
        // If the document is malformed or in JSON format, create a new one
        if (!doc.toString().includes('\n')) {
          throw new Error('File is in JSON format, recreating as YAML');
        }
      } catch {
        // Create new document if parsing fails or file is malformed
        doc = new YAML.Document({
          hub: configToSave.hub,
          plugins: configToSave.plugins,
          install: installObj,
          rules: configToSave.rules,
          schedules: configToSave.schedules,
        });
      }
    } else {
      // Create new document with default structure
      doc = new YAML.Document({
        hub: configToSave.hub,
        plugins: configToSave.plugins,
        install: installObj,
        rules: configToSave.rules,
        schedules: configToSave.schedules,
      });
    }

    // Only update if doc was successfully parsed
    if (doc.toString().includes('\n')) {
      doc.set('hub', configToSave.hub);
      doc.set('plugins', configToSave.plugins);
      doc.set('install', installObj);
      doc.set('rules', configToSave.rules);
      doc.set('schedules', configToSave.schedules);
    }

    // Stringify with proper formatting
    const yamlContent = doc.toString();

    await Bun.write(this.configPath, yamlContent);

    // Update cached config
    if (config) {
      this.config = config;
    }

    console.log(`[config] Saved to ${this.configPath}`);
  }

  /**
   * Add a plugin to the install list and save config
   */
  async addPlugin(name: string, specifier: string): Promise<void> {
    const config = this.get();

    // Check if plugin already exists
    const existing = config.install.find((p) => p.name === name);
    if (existing) {
      // Update specifier if different
      if (existing.specifier !== specifier) {
        existing.specifier = specifier;
        await this.save(config);
      }
      return;
    }

    // Add new plugin
    config.install.push({ name, specifier });
    await this.save(config);
  }

  /**
   * Remove a plugin from the install list and save config
   */
  async removePlugin(name: string): Promise<void> {
    const config = this.get();
    const initialLength = config.install.length;

    config.install = config.install.filter((p) => p.name !== name);

    // Only save if something was removed
    if (config.install.length !== initialLength) {
      await this.save(config);
    }
  }

  /**
   * Resolved plugin info with actual package name and root directory.
   */
  async resolvePluginEntry(entry: PluginEntry): Promise<{ name: string; rootDirectory: string }> {
    const { name, specifier } = entry;

    // workspace:* → find package by name in ./plugins/
    if (specifier === 'workspace:*') {
      const result = await this.#findWorkspacePackage(name);
      if (result) return result;

      throw new Error(`Workspace package not found: ${name}`);
    }

    // workspace:./path → explicit local path
    if (specifier.startsWith('workspace:')) {
      const relativePath = specifier.slice('workspace:'.length);
      const pluginDir = relativePath.startsWith('./')
        ? `${this.rootDir}/${relativePath.slice(2)}`
        : `${this.rootDir}/${relativePath}`;

      const result = await this.#resolveWorkspacePackage(pluginDir, name);
      if (result) return result;

      throw new Error(`Workspace package not found at: ${pluginDir}`);
    }

    // file: specifier → direct file path (remove file: prefix, it's now the root directory)
    if (specifier.startsWith('file:')) {
      const path = specifier.slice('file:'.length);
      return { name, rootDirectory: path };
    }

    // Registry/remote package → we don't know the rootDirectory yet, return name and let PluginManager resolve it
    // This will be resolved later by the PluginRegistry
    throw new Error(
      `Cannot resolve rootDirectory for npm package: ${name}. Install via registry first.`
    );
  }

  /**
   * Parse the install section from config.
   * Supports both new format (Record<string, string>) and legacy format (Array).
   */
  #parseInstallSection(install: unknown): PluginEntry[] {
    if (!install) return [];

    // New format: Record<string, string> like package.json
    // { "timer": "workspace:./plugins/timer", "@brika/plugin-hue": "^1.0.0" }
    if (typeof install === 'object' && !Array.isArray(install)) {
      return Object.entries(install as Record<string, string>).map(([name, specifier]) => ({
        name,
        specifier,
      }));
    }

    // Legacy format: Array of { ref, version?, enabled }
    if (Array.isArray(install)) {
      return install
        .filter((entry) => entry.enabled !== false)
        .map((entry) => ({
          name: this.#legacyRefToName(entry.ref),
          specifier: this.#legacyRefToSpecifier(entry.ref, entry.version),
        }));
    }

    return [];
  }

  /**
   * Convert legacy ref to package name.
   */
  #legacyRefToName(ref: string): string {
    if (ref.startsWith('workspace:')) return ref.slice('workspace:'.length);
    if (ref.startsWith('npm:')) return ref.slice('npm:'.length);
    if (ref.startsWith('file:')) return ref; // Keep as-is
    return ref;
  }

  /**
   * Convert legacy ref to specifier.
   */
  #legacyRefToSpecifier(ref: string, version?: string): string {
    if (ref.startsWith('workspace:')) {
      const name = ref.slice('workspace:'.length);
      return `workspace:./plugins/${name}`;
    }
    if (ref.startsWith('npm:')) {
      return version || 'latest';
    }
    if (ref.startsWith('file:')) {
      return ref; // Keep file: prefix
    }
    return version || 'latest';
  }

  /**
   * Find a workspace package by name, scanning ./plugins/ directory.
   * Handles scoped packages like @brika/plugin-timer.
   */
  async #findWorkspacePackage(
    packageName: string
  ): Promise<{ name: string; rootDirectory: string } | null> {
    const pluginsDir = `${this.rootDir}/plugins`;

    // Get all subdirectories in plugins/
    const glob = new Bun.Glob('*/package.json');
    for await (const path of glob.scan({ cwd: pluginsDir, absolute: false })) {
      const pkgPath = `${pluginsDir}/${path}`;
      try {
        const pkg = await Bun.file(pkgPath).json();
        if (pkg.name === packageName) {
          const pluginDir = pkgPath.replace('/package.json', '');
          return { name: pkg.name, rootDirectory: pluginDir };
        }
      } catch {
        // Skip invalid package.json files
      }
    }

    return null;
  }

  /**
   * Resolve a workspace package directory, reading the actual package name from package.json.
   */
  async #resolveWorkspacePackage(
    pluginDir: string,
    fallbackName: string
  ): Promise<{ name: string; rootDirectory: string } | null> {
    const pkgPath = `${pluginDir}/package.json`;

    if (!(await Bun.file(pkgPath).exists())) {
      return null;
    }

    // Read actual package name from package.json
    const pkg = await Bun.file(pkgPath).json();
    const actualName = pkg.name || fallbackName;

    return { name: actualName, rootDirectory: pluginDir };
  }

  private merge<T extends object>(defaults: T, overrides: Partial<T>): T {
    const result = { ...defaults };
    for (const key in overrides) {
      const val = overrides[key];
      if (val !== undefined && val !== null) {
        if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object') {
          result[key] = this.merge(result[key] as object, val as object) as T[Extract<
            keyof T,
            string
          >];
        } else {
          result[key] = val as T[Extract<keyof T, string>];
        }
      }
    }
    return result;
  }
}
