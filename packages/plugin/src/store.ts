// ─────────────────────────────────────────────────────────────────────────────
// Plugin Store Types — shared between hub and UI
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin data from the store (combines npm + verified status + compatibility) */
export interface StorePlugin {
  name: string;
  displayName?: string;
  version: string;
  /** Version string to pass to the installer (e.g. 'workspace:*' for local plugins) */
  installVersion: string;
  description: string;
  author:
    | string
    | {
        name: string;
        email?: string;
      };
  keywords: string[];
  repository?:
    | string
    | {
        url: string;
      };
  homepage?: string;
  license?: string;
  engines?: {
    brika?: string;
  };
  verified: boolean;
  verifiedAt?: string;
  featured: boolean;
  compatible: boolean;
  compatibilityReason?: string;
  installed: boolean;
  installedVersion?: string;
  /** True when the registry's latest version is newer than the installed one. */
  updateAvailable: boolean;
  source: string;
  /**
   * "Open in <name>" link to the plugin's page on its source registry (npm, a store, ...), built from
   * the registry catalogue. Absent for local plugins.
   */
  externalRegistry?: {
    name: string;
    url: string;
  };
  npm: {
    downloads: number;
    publishedAt: string;
  };
  /** Grants declared by this plugin (keyed by reverse-DNS id), with per-grant scope */
  grants?: Record<string, unknown>;
}

/** npm package data from registry API */
export interface PluginPackageData {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  author?:
    | string
    | {
        name: string;
        email?: string;
      };
  keywords?: string[];
  repository?:
    | string
    | {
        type?: string;
        url: string;
        directory?: string;
      };
  homepage?: string;
  license?: string;
  engines?: {
    brika?: string;
  };
  date?: string;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
  /** Grants declared by this plugin (keyed by reverse-DNS id), with per-grant scope */
  grants?: Record<string, unknown>;
  score?: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
}

/** npm search result from registry API */
export interface PluginSearchResult {
  package: PluginPackageData;
  source: string;
  installVersion: string;
  downloadCount: number;
  installed: boolean;
  installedVersion?: string;
  /** True when the registry's latest version is newer than the installed one. */
  updateAvailable: boolean;
  compatible: boolean;
  compatibilityReason?: string;
}
