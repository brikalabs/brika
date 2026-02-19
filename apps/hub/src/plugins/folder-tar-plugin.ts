/**
 * Plugin for .tar folder imports
 * Works for both runtime (bun run) and bundler (Bun.build)
 *
 * Usage: import archive from "@/templates.tar"
 * Bun resolves paths (respects tsconfig), we just handle loading.
 */

import { stat } from 'node:fs/promises';
import type { BunPlugin } from 'bun';
import { packFolder } from './pack-folder';

export function folderTarPlugin(): BunPlugin {
  return {
    name: 'folder-tar',
    setup(build) {
      build.onLoad({ filter: /\.tar(?:\0)?$/ }, async ({ path }) => {
        const normalizedPath = path.replace(/\0/g, '');
        const folderPath = normalizedPath.endsWith('.tar')
          ? normalizedPath.slice(0, -4)
          : normalizedPath;

        let sourceStat;
        try {
          sourceStat = await stat(folderPath);
        } catch {
          throw new Error(`[folder-tar] Missing source folder: ${folderPath}`);
        }

        if (!sourceStat.isDirectory()) {
          throw new Error(`[folder-tar] Source is not a folder: ${folderPath}`);
        }

        const bytes = await packFolder(folderPath);
        return {
          contents: `export default new Uint8Array([${bytes.join(',')}]);`,
          loader: 'js',
        };
      });
    },
  };
}
