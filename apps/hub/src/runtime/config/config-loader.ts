/**
 * ELIA Configuration Loader
 *
 * Loads and validates elia.yml configuration
 */

import { inject, singleton } from '@elia/shared';
import { EliaInitializer } from './elia-initializer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plugin entry in the new package.json-like format.
 * Key is package name, value is version specifier.
 */
export interface PluginEntry {
  /** Package name (e.g., "@elia/plugin-timer", "timer") */
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

export interface EliaConfig {
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

const DEFAULT_CONFIG: EliaConfig = {
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
  readonly #init = inject(EliaInitializer);

  private config: EliaConfig | null = null;

  private get configPath(): string {
    return `${this.#init.eliaDir}/elia.yml`;
  }

  private get rootDir(): string {
    return this.#init.rootDir;
  }

  private get eliaDir(): string {
    return this.#init.eliaDir;
  }

  async load(): Promise<EliaConfig> {
    if (this.config) return this.config;

    try {
      const file = Bun.file(this.configPath);
      const fileExists = await file.exists();

      if (!fileExists) {
        console.log(`[config] No elia.yml found at ${this.configPath}, using defaults`);
        this.config = DEFAULT_CONFIG;
        return this.config;
      }

      const content = await file.text();
      const parsed = Bun.YAML.parse(content) as Record<string, unknown>;

      // Parse install section - can be new format (Record) or legacy format (Array)
      const installEntries = this.#parseInstallSection(parsed.install);

      this.config = {
        ...this.merge(DEFAULT_CONFIG, parsed as Partial<EliaConfig>),
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

  get(): EliaConfig {
    if (!this.config) {
      throw new Error('Config not loaded. Call load() first.');
    }
    return this.config;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  getEliaDir(): string {
    return this.eliaDir;
  }

  /**
   * Resolved plugin info with actual package name and entry path.
   */
  async resolvePluginEntry(entry: PluginEntry): Promise<{ name: string; ref: string }> {
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

    // file: specifier → direct file path
    if (specifier.startsWith('file:')) {
      return { name, ref: specifier };
    }

    // Registry/remote package → return name as ref (resolved by PluginRegistry)
    // Handles: ^1.0.0, latest, github:user/repo, git+https://..., etc.
    return { name, ref: name };
  }

  /**
   * Parse the install section from config.
   * Supports both new format (Record<string, string>) and legacy format (Array).
   */
  #parseInstallSection(install: unknown): PluginEntry[] {
    if (!install) return [];

    // New format: Record<string, string> like package.json
    // { "timer": "workspace:./plugins/timer", "@elia/plugin-hue": "^1.0.0" }
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
   * Handles scoped packages like @elia/plugin-timer.
   */
  async #findWorkspacePackage(packageName: string): Promise<{ name: string; ref: string } | null> {
    const pluginsDir = `${this.rootDir}/plugins`;

    // Get all subdirectories in plugins/
    const glob = new Bun.Glob('*/package.json');
    for await (const path of glob.scan({ cwd: pluginsDir, absolute: false })) {
      const pkgPath = `${pluginsDir}/${path}`;
      try {
        const pkg = await Bun.file(pkgPath).json();
        if (pkg.name === packageName) {
          const pluginDir = pkgPath.replace('/package.json', '');
          const ref = await this.#resolvePluginDir(pluginDir);
          return { name: pkg.name, ref };
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
  ): Promise<{ name: string; ref: string } | null> {
    const pkgPath = `${pluginDir}/package.json`;

    if (!(await Bun.file(pkgPath).exists())) {
      return null;
    }

    // Read actual package name from package.json
    const pkg = await Bun.file(pkgPath).json();
    const actualName = pkg.name || fallbackName;

    // Resolve entry point
    const ref = await this.#resolvePluginDir(pluginDir);

    return { name: actualName, ref };
  }

  /**
   * Resolve a plugin directory to a file: ref with correct entry point.
   */
  async #resolvePluginDir(pluginDir: string): Promise<string> {
    try {
      const pkgPath = `${pluginDir}/package.json`;
      const pkgFile = Bun.file(pkgPath);
      const pkgContent = await pkgFile.json();

      // Check exports["."] first, then main, then default to src/index.ts
      let entryPoint = 'src/index.ts';
      if (pkgContent.exports?.['.']?.import) {
        entryPoint = pkgContent.exports['.'].import;
      } else if (pkgContent.exports?.['.']) {
        entryPoint = pkgContent.exports['.'];
      } else if (pkgContent.main) {
        entryPoint = pkgContent.main;
      }

      // Remove leading ./ if present
      if (entryPoint.startsWith('./')) {
        entryPoint = entryPoint.slice(2);
      }

      return `file:${pluginDir}/${entryPoint}`;
    } catch {
      // Fall back to default
      return `file:${pluginDir}/src/index.ts`;
    }
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
