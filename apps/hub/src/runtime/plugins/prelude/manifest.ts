/**
 * Prelude Manifest Loader
 *
 * Walks up from Bun.main to find the nearest package.json.
 * Cached so multiple bridge methods can access it.
 *
 * The type is the capability slice of `@brika/schema`'s PluginPackageSchema
 * (type-only import: nothing of zod reaches the prelude bundle), so the
 * prelude can never drift from the manifest schema the hub validates against.
 */

import type { PluginPackageSchema } from '@brika/schema';

export type PluginManifest = Pick<
  PluginPackageSchema,
  'name' | 'version' | 'blocks' | 'sparks' | 'bricks' | 'pages' | 'actions' | 'tools'
>;

let cached: { manifest: PluginManifest; rootDir: string } | null = null;

export function loadManifest(): { manifest: PluginManifest; rootDir: string } {
  if (cached) {
    return cached;
  }

  let dir = Bun.main.substring(0, Bun.main.lastIndexOf('/'));
  while (dir) {
    try {
      Bun.resolveSync('./package.json', dir);
      const manifest: PluginManifest = require(`${dir}/package.json`);
      cached = { manifest, rootDir: dir };
      return cached;
    } catch {
      const i = dir.lastIndexOf('/');
      dir = i > 0 ? dir.substring(0, i) : '';
    }
  }
  throw new Error(`No package.json found for ${Bun.main}`);
}
