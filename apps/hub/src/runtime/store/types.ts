export type { PluginPackageData, PluginSearchResult, StorePlugin } from '@brika/plugin';

/** Compatibility check result */
export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}
