import { checkCompatibility } from '@/runtime/utils/compatibility';
import type { RawRegistryPlugin } from './sources/registry-source';
import type { PluginSearchResult } from './types';

interface PluginConfig {
  plugins: ReadonlyArray<{ name: string; version: string }>;
}

/**
 * Computes installed status and compatibility for a plugin — the shared enrichment core.
 * Used by both list endpoints (via enrichPlugins) and the detail endpoint directly.
 */
export function computeEnrichment(
  pkg: { name: string; version: string; engines?: { brika?: string } },
  config: PluginConfig
) {
  const entry = config.plugins.find((p) => p.name === pkg.name);
  const { compatible, reason: compatibilityReason } = checkCompatibility(pkg.engines?.brika);
  return {
    installed: entry !== undefined,
    installedVersion: entry ? pkg.version : undefined,
    compatible,
    compatibilityReason,
  };
}

/** Enriches a list of raw registry results with installed status and compatibility. */
export function enrichPlugins(
  plugins: RawRegistryPlugin[],
  config: PluginConfig
): PluginSearchResult[] {
  return plugins.map((plugin) => ({ ...plugin, ...computeEnrichment(plugin.package, config) }));
}
