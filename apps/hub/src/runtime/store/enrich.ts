import { semver } from 'bun';
import { checkCompatibility } from '@/runtime/utils/compatibility';
import type { RawRegistryPlugin } from './sources/registry-source';
import type { PluginSearchResult } from './types';

/**
 * True when the registry's latest is strictly newer than the installed version. False when either is
 * not comparable semver (a `workspace:`/`file:`/tarball install never prompts an update; it tracks
 * its source, not a published release).
 */
function isNewer(latest: string, installed: string): boolean {
  try {
    return semver.order(latest, installed) > 0;
  } catch {
    return false;
  }
}

interface PluginConfig {
  plugins: ReadonlyArray<{
    name: string;
    version: string;
  }>;
}

/**
 * Computes installed status and compatibility for a plugin — the shared enrichment core.
 * Used by both list endpoints (via enrichPlugins) and the detail endpoint directly.
 */
export function computeEnrichment(
  pkg: {
    name: string;
    version: string;
    engines?: {
      brika?: string;
    };
  },
  config: PluginConfig
) {
  const entry = config.plugins.find((p) => p.name === pkg.name);
  const { compatible, reason: compatibilityReason } = checkCompatibility(pkg.engines?.brika);
  return {
    installed: entry !== undefined,
    // The version actually installed (the brika.yml spec), not the registry's latest, so the UI can
    // tell whether an update is available and show "installed → latest".
    installedVersion: entry?.version,
    updateAvailable: entry !== undefined && isNewer(pkg.version, entry.version),
    compatible,
    compatibilityReason,
  };
}

/** Enriches a list of raw registry results with installed status and compatibility. */
export function enrichPlugins(
  plugins: RawRegistryPlugin[],
  config: PluginConfig
): PluginSearchResult[] {
  return plugins.map((plugin) => ({
    ...plugin,
    ...computeEnrichment(plugin.package, config),
  }));
}
