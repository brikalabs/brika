/**
 * ELIA Configuration Loader
 *
 * Loads and validates elia.yml configuration
 */

import { singleton } from "tsyringe";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginEntry {
  ref: string;
  version?: string;
  enabled: boolean;
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
  trigger: { type: "cron"; expr: string } | { type: "interval"; ms: number };
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
  hub: { port: 3001, host: "0.0.0.0" },
  plugins: {
    installDir: "./plugins/.installed",
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
  private config: EliaConfig | null = null;
  private readonly configPath: string;
  private readonly rootDir: string;

  constructor() {
    // Find project root (where elia.yml should be)
    // Bun.main = /path/to/elia/apps/hub/src/main.ts
    // We need /path/to/elia (3 directories up from src/)
    const parts = Bun.main.split("/");
    // Remove: main.ts, src, hub, apps -> get project root
    this.rootDir = parts.slice(0, -4).join("/");
    this.configPath = `${this.rootDir}/elia.yml`;
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
      const parsed = Bun.YAML.parse(content) as Partial<EliaConfig>;

      this.config = this.merge(DEFAULT_CONFIG, parsed);
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
      throw new Error("Config not loaded. Call load() first.");
    }
    return this.config;
  }

  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Resolve a plugin reference to a file path
   * Reads package.json to determine the correct entry point
   */
  async resolvePluginRef(ref: string): Promise<string> {
    // workspace:name → Read package.json for entry point
    if (ref.startsWith("workspace:")) {
      const name = ref.slice("workspace:".length);
      const pluginDir = `${this.rootDir}/plugins/${name}`;

      // Try to read package.json to get the correct entry point
      try {
        const pkgPath = `${pluginDir}/package.json`;
        const pkgFile = Bun.file(pkgPath);
        const pkgContent = await pkgFile.json();

        // Check exports["."] first, then main, then default to src/index.ts
        let entryPoint = "src/index.ts";
        if (pkgContent.exports?.["."]?.import) {
          entryPoint = pkgContent.exports["."].import;
        } else if (pkgContent.exports?.["."]) {
          entryPoint = pkgContent.exports["."];
        } else if (pkgContent.main) {
          entryPoint = pkgContent.main;
        }

        // Remove leading ./ if present
        if (entryPoint.startsWith("./")) {
          entryPoint = entryPoint.slice(2);
        }

        return `file:${pluginDir}/${entryPoint}`;
      } catch {
        // Fall back to default
        return `file:${pluginDir}/src/index.ts`;
      }
    }

    // npm:package → npm:package (handled by store service)
    if (ref.startsWith("npm:")) {
      return ref;
    }

    // git:url → git+url
    if (ref.startsWith("git:")) {
      return `git+https://${ref.slice("git:".length)}`;
    }

    // Already a file: or other format
    return ref;
  }

  private merge<T extends object>(defaults: T, overrides: Partial<T>): T {
    const result = { ...defaults };
    for (const key in overrides) {
      const val = overrides[key];
      if (val !== undefined && val !== null) {
        if (typeof val === "object" && !Array.isArray(val) && typeof result[key] === "object") {
          result[key] = this.merge(result[key] as object, val as object) as T[Extract<keyof T, string>];
        } else {
          result[key] = val as T[Extract<keyof T, string>];
        }
      }
    }
    return result;
  }
}
