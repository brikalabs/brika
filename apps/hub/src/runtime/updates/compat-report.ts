/**
 * Pre-flight compatibility report — answers "what breaks if I run
 * `apply` right now?" by simulating each installed plugin's
 * `engines.brika` semver range against the *target* version.
 *
 * Today plugin compatibility is only evaluated at *load* time, which
 * means the user clicks "Update" with no visibility into whether the
 * new hub will silently disable half their plugins. This report runs
 * the same check the lifecycle does, but ahead of time, so the
 * UpdateDialog can warn:
 *
 *     "Updating to v0.6.0 will disable 3 plugins"
 *
 * Pure: no DB writes, no DI requirements beyond reading the plugin
 * list. Safe to call from a GET route without throttling.
 */

import { inject, singleton } from '@brika/di';
import { satisfiesVersion } from '@/runtime/plugins/utils';
import { StateStore } from '@/runtime/state/state-store';

export interface CompatPluginEntry {
  readonly name: string;
  readonly currentRequires: string | null;
  readonly willBeCompatible: boolean;
}

export interface CompatReport {
  readonly targetVersion: string;
  readonly plugins: readonly CompatPluginEntry[];
  /** Plugins whose `engines.brika` rejects the target version. */
  readonly willDisableCount: number;
  /** Plugins missing an `engines.brika` declaration — undefined behavior. */
  readonly missingRequirementsCount: number;
}

/** Minimal shape of an installed plugin the compat check cares about. */
export interface CompatPluginInput {
  readonly name: string;
  readonly metadata: {
    readonly engines?: { readonly brika?: string };
  };
}

/**
 * Pure computation, exposed for unit testing without DI. The DI
 * wrapper below is the production entry point.
 */
export function computeCompatReport(
  targetVersion: string,
  installed: readonly CompatPluginInput[]
): CompatReport {
  const plugins: CompatPluginEntry[] = [];
  let willDisable = 0;
  let missing = 0;

  for (const stored of installed) {
    const required = stored.metadata.engines?.brika ?? null;
    if (required === null) {
      missing += 1;
      plugins.push({
        name: stored.name,
        currentRequires: null,
        willBeCompatible: false,
      });
      continue;
    }
    const willBeCompatible = safeSatisfies(targetVersion, required);
    if (!willBeCompatible) {
      willDisable += 1;
    }
    plugins.push({ name: stored.name, currentRequires: required, willBeCompatible });
  }

  return {
    targetVersion,
    plugins,
    willDisableCount: willDisable,
    missingRequirementsCount: missing,
  };
}

@singleton()
export class CompatReportBuilder {
  readonly #state = inject(StateStore);

  build(targetVersion: string): CompatReport {
    return computeCompatReport(targetVersion, this.#state.listInstalledWithMetadata());
  }
}

/**
 * `satisfies` throws on a malformed range/version pair (e.g. plugin
 * ships a typo like `^^0.5`). Treat that as "incompatible" — the
 * loader would refuse it anyway, and we don't want a bad manifest
 * to crash the pre-flight check.
 */
function safeSatisfies(version: string, range: string): boolean {
  try {
    return satisfiesVersion(version, range);
  } catch {
    return false;
  }
}
