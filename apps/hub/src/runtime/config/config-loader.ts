/**
 * BRIKA Configuration Loader
 *
 * Loads and validates brika.yml configuration
 */

import { inject, singleton } from '@brika/di';
import YAML from 'yaml';
import { Logger } from '../logs/log-router';
import { BrikaInitializer } from './brika-initializer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plugin entry with version and optional config.
 */
export interface PluginEntry {
  /** Package name (e.g., "@brika/plugin-timer") */
  name: string;
  /** Version specifier (e.g., "^1.0.0", "workspace:./plugins/timer") */
  version: string;
  /** Plugin configuration values */
  config?: Record<string, unknown>;
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
    plugins: {
      installDir: string;
      heartbeatInterval: number;
      heartbeatTimeout: number;
    };
  };
  plugins: PluginEntry[];
  rules: RuleEntry[];
  schedules: ScheduleEntry[];
}

const DEFAULT_CONFIG: BrikaConfig = {
  hub: {
    port: 3001,
    host: '0.0.0.0',
    plugins: {
      installDir: './plugins/.installed',
      heartbeatInterval: 5000,
      heartbeatTimeout: 15000,
    },
  },
  plugins: [],
  rules: [],
  schedules: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Config Loader
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class ConfigLoader {
  readonly #init = inject(BrikaInitializer);
  readonly #logger = inject(Logger);

  #config: BrikaConfig | null = null;

  get configPath(): string {
    return `${this.#init.brikaDir}/brika.yml`;
  }

  get rootDir(): string {
    return this.#init.rootDir;
  }

  get brikaDir(): string {
    return this.#init.brikaDir;
  }

  async load(): Promise<BrikaConfig> {
    if (this.#config) return this.#config;

    try {
      const file = Bun.file(this.configPath);
      if (!(await file.exists())) {
        this.#logger.info("Configuration file not found, using default configuration", {
          configPath: this.configPath
        });
        this.#config = DEFAULT_CONFIG;
        return this.#config;
      }

      const content = await file.text();
      const parsed = YAML.parse(content) as Record<string, unknown>;

      const hubParsed = (parsed.hub ?? {}) as Record<string, unknown>;
      const hubPluginsParsed = (hubParsed.plugins ?? {}) as Record<string, unknown>;

      this.#config = {
        hub: {
          port: (hubParsed.port as number) ?? DEFAULT_CONFIG.hub.port,
          host: (hubParsed.host as string) ?? DEFAULT_CONFIG.hub.host,
          plugins: {
            installDir:
              (hubPluginsParsed.installDir as string) ?? DEFAULT_CONFIG.hub.plugins.installDir,
            heartbeatInterval:
              (hubPluginsParsed.heartbeatInterval as number) ??
              DEFAULT_CONFIG.hub.plugins.heartbeatInterval,
            heartbeatTimeout:
              (hubPluginsParsed.heartbeatTimeout as number) ??
              DEFAULT_CONFIG.hub.plugins.heartbeatTimeout,
          },
        },
        plugins: this.#parsePlugins(parsed.plugins),
        rules: (parsed.rules as RuleEntry[]) ?? [],
        schedules: (parsed.schedules as ScheduleEntry[]) ?? [],
      };

      this.#logger.info("Configuration loaded successfully", {
        configPath: this.configPath,
        pluginCount: this.#config.plugins.length,
        ruleCount: this.#config.rules.length,
        scheduleCount: this.#config.schedules.length,
      });
      return this.#config;
    } catch (err) {
      this.#logger.error(
        "Failed to load configuration file, falling back to defaults",
        { configPath: this.configPath },
        { error: err }
      );
      this.#config = DEFAULT_CONFIG;
      return this.#config;
    }
  }

  get(): BrikaConfig {
    if (!this.#config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.#config;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getBrikaDir(): string {
    return this.brikaDir;
  }

  /**
   * Save the current config to brika.yml
   */
  async save(config?: BrikaConfig): Promise<void> {
    const configToSave = config ?? this.#config;
    if (!configToSave) {
      throw new Error('No config to save. Call load() first or provide a config.');
    }

    // Convert plugin entries to object format for YAML
    const pluginsObj: Record<string, { version: string; config?: Record<string, unknown> }> = {};
    for (const entry of configToSave.plugins) {
      pluginsObj[entry.name] = {
        version: entry.version,
        ...(entry.config && Object.keys(entry.config).length > 0 ? { config: entry.config } : {}),
      };
    }

    const configStructure = {
      hub: configToSave.hub,
      plugins: pluginsObj,
      rules: configToSave.rules,
      schedules: configToSave.schedules,
    };

    const file = Bun.file(this.configPath);
    let doc: YAML.Document;

    if (await file.exists()) {
      const content = await file.text();
      try {
        doc = YAML.parseDocument(content);
        doc.set('hub', configToSave.hub);
        doc.set('plugins', pluginsObj);
        doc.set('rules', configToSave.rules);
        doc.set('schedules', configToSave.schedules);
      } catch {
        doc = new YAML.Document(configStructure);
      }
    } else {
      doc = new YAML.Document(configStructure);
    }

    await Bun.write(this.configPath, doc.toString());

    if (config) {
      this.#config = config;
    }

    this.#logger.info("Configuration saved successfully", {
      configPath: this.configPath,
      pluginCount: configToSave.plugins.length,
    });
  }

  /**
   * Add a plugin to the plugins list and save config
   */
  async addPlugin(name: string, version: string): Promise<void> {
    const config = this.get();
    const existing = config.plugins.find((p) => p.name === name);

    if (existing) {
      if (existing.version !== version) {
        existing.version = version;
        await this.save(config);
      }
      return;
    }

    config.plugins.push({ name, version });
    await this.save(config);
  }

  /**
   * Remove a plugin from the plugins list and save config
   */
  async removePlugin(name: string): Promise<void> {
    const config = this.get();
    const initialLength = config.plugins.length;
    config.plugins = config.plugins.filter((p) => p.name !== name);

    if (config.plugins.length !== initialLength) {
      await this.save(config);
    }
  }

  /**
   * Get plugin config by name
   */
  getPluginConfig(name: string): Record<string, unknown> | undefined {
    return this.get().plugins.find((p) => p.name === name)?.config;
  }

  /**
   * Set plugin config and save
   */
  async setPluginConfig(name: string, pluginConfig: Record<string, unknown>): Promise<void> {
    const config = this.get();
    const plugin = config.plugins.find((p) => p.name === name);
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }
    plugin.config = pluginConfig;
    await this.save(config);
  }

  /**
   * Resolve plugin entry to actual package name and root directory.
   */
  async resolvePluginEntry(entry: PluginEntry): Promise<{ name: string; rootDirectory: string }> {
    const { name, version } = entry;

    // workspace:* → find package by name in ./plugins/
    if (version === 'workspace:*') {
      const result = await this.#findWorkspacePackage(name);
      if (result) return result;
      throw new Error(`Workspace package not found: ${name}`);
    }

    // workspace:./path → explicit local path
    if (version.startsWith('workspace:')) {
      const workspaceRoot = await this.#findWorkspaceRoot();
      const relativePath = version.slice('workspace:'.length);
      const pluginDir = relativePath.startsWith('./')
        ? `${workspaceRoot}/${relativePath.slice(2)}`
        : `${workspaceRoot}/${relativePath}`;

      const result = await this.#resolveWorkspacePackage(pluginDir, name);
      if (result) return result;
      throw new Error(`Workspace package not found at: ${pluginDir}`);
    }

    // file: specifier → direct file path
    if (version.startsWith('file:')) {
      return { name, rootDirectory: version.slice('file:'.length) };
    }

    // npm package - check in registry's plugins directory
    const registryPluginPath = `${this.brikaDir}/plugins/node_modules/${name}`;
    const pkgJsonPath = `${registryPluginPath}/package.json`;
    if (await Bun.file(pkgJsonPath).exists()) {
      return { name, rootDirectory: registryPluginPath };
    }

    throw new Error(`Cannot resolve npm package: ${name}. Install via registry first.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────────

  #parsePlugins(plugins: unknown): PluginEntry[] {
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) {
      return [];
    }

    return Object.entries(
      plugins as Record<string, { version: string; config?: Record<string, unknown> }>
    ).map(([name, entry]) => ({
      name,
      version: entry.version,
      config: entry.config,
    }));
  }

  async #findWorkspacePackage(
    packageName: string
  ): Promise<{ name: string; rootDirectory: string } | null> {
    const workspaceRoot = await this.#findWorkspaceRoot();
    const pluginsDir = `${workspaceRoot}/plugins`;

    try {
      const glob = new Bun.Glob('*/package.json');
      for await (const path of glob.scan({ cwd: pluginsDir, absolute: false })) {
        const pkgPath = `${pluginsDir}/${path}`;
        try {
          const pkg = await Bun.file(pkgPath).json();
          if (pkg.name === packageName) {
            return { name: pkg.name, rootDirectory: pkgPath.replace('/package.json', '') };
          }
        } catch {
          // Skip invalid package.json
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return null;
  }

  async #findWorkspaceRoot(): Promise<string> {
    let dir = this.rootDir;
    const { dirname } = await import('node:path');

    for (let i = 0; i < 5; i++) {
      const bunLockPath = `${dir}/bun.lock`;
      if (await Bun.file(bunLockPath).exists()) {
        try {
          const pkg = await Bun.file(`${dir}/package.json`).json();
          if (pkg.workspaces) return dir;
        } catch {
          // Continue
        }
      }

      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return this.rootDir;
  }

  async #resolveWorkspacePackage(
    pluginDir: string,
    fallbackName: string
  ): Promise<{ name: string; rootDirectory: string } | null> {
    const pkgPath = `${pluginDir}/package.json`;
    if (!(await Bun.file(pkgPath).exists())) return null;

    const pkg = await Bun.file(pkgPath).json();
    return { name: pkg.name || fallbackName, rootDirectory: pluginDir };
  }
}
