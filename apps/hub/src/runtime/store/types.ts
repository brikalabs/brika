export type { StorePlugin, PluginPackageData, PluginSearchResult } from '@brika/plugin';

/** Compatibility check result */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}
