/**
 * Manifest Loader
 *
 * Walks up from Bun.main to find the nearest package.json.
 */

import type { Manifest } from './register';

let cachedRootDir: string | null = null;

export function loadManifest(): Manifest {
  let dir = Bun.main.substring(0, Bun.main.lastIndexOf('/'));
  while (dir) {
    try {
      Bun.resolveSync('./package.json', dir);
      cachedRootDir = dir;
      return require(`${dir}/package.json`);
    } catch {
      const i = dir.lastIndexOf('/');
      dir = i > 0 ? dir.substring(0, i) : '';
    }
  }
  throw new Error(`No package.json found for ${Bun.main}`);
}

/**
 * Get the root directory of the current plugin (where package.json lives).
 * Populated during `loadManifest()`, which runs when the Context is created.
 */
export function getPluginRootDirectory(): string {
  if (cachedRootDir) return cachedRootDir;
  loadManifest();
  if (!cachedRootDir) throw new Error('Could not resolve plugin root directory');
  return cachedRootDir;
}
