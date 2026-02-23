/** Plugin data from the store (combines npm + verified status + compatibility) */
export interface StorePlugin {
  name: string;
  displayName?: string;
  version: string;
  /** Version string to pass to the installer (e.g. 'workspace:*' for local plugins) */
  installVersion: string;
  description: string;
  author: string | { name: string; email?: string };
  keywords: string[];
  repository?: string | { url: string };
  homepage?: string;
  license?: string;
  engines?: { brika?: string };
  verified: boolean;
  verifiedAt?: string;
  featured: boolean;
  compatible: boolean;
  compatibilityReason?: string;
  installed: boolean;
  installedVersion?: string;
  source: string;
  npm: {
    downloads: number;
    publishedAt: string;
  };
}

/** npm package data from registry API */
export interface PluginPackageData {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  author?: string | { name: string; email?: string };
  keywords?: string[];
  repository?: string | { type?: string; url: string; directory?: string };
  homepage?: string;
  license?: string;
  engines?: { brika?: string };
  date?: string;
  links?: {
    npm?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
  };
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
  compatible: boolean;
  compatibilityReason?: string;
}

/** Compatibility check result */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}
