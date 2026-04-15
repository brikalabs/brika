/**
 * Manifest Loader
 *
 * Delegates to the prelude bridge which loads and caches the manifest.
 */

import type { Manifest } from './register';
import { requireBridge } from './register';

export function loadManifest(): Manifest {
  return requireBridge().getManifest();
}

/**
 * Get the root directory of the current plugin (where package.json lives).
 */
export function getPluginRootDirectory(): string {
  return requireBridge().getPluginRootDirectory();
}
