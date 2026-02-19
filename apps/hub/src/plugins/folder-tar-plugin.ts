/**
 * Plugin for .tar folder imports
 * Works for both runtime (bun run) and bundler (Bun.build)
 *
 * Usage: import archive from "@/templates.tar"
 * Bun resolves paths (respects tsconfig), we just handle loading.
 */

import type { BunPlugin } from 'bun';
import { packFolder } from './pack-folder';

export function folderTarPlugin(): BunPlugin {
  return {
    name: 'folder-tar',
    setup(build) {
      build.onLoad({ filter: /\.tar$/ }, async ({ path }) => {
        const bytes = await packFolder(path.replace(/\.tar$/, ''));
        return {
          contents: `export default new Uint8Array([${bytes.join(',')}]);`,
          loader: 'js',
        };
      });
    },
  };
}
