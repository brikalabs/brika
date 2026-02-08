/**
 * Manifest Loader
 *
 * Walks up from Bun.main to find the nearest package.json.
 */

import type { Manifest } from './register';

export function loadManifest(): Manifest {
  let dir = Bun.main.substring(0, Bun.main.lastIndexOf('/'));
  while (dir) {
    try {
      Bun.resolveSync('./package.json', dir);
      return require(`${dir}/package.json`);
    } catch {
      const i = dir.lastIndexOf('/');
      dir = i > 0 ? dir.substring(0, i) : '';
    }
  }
  throw new Error(`No package.json found for ${Bun.main}`);
}
