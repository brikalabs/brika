/**
 * Prelude Manifest Loader
 *
 * Walks up from Bun.main to find the nearest package.json.
 * Cached so multiple bridge methods can access it.
 */

export interface PluginManifest {
  name: string;
  version: string;
  blocks?: Array<{
    id: string;
    name: string;
    description?: string;
    category: string;
    icon?: string;
    color?: string;
  }>;
  sparks?: Array<{ id: string; name: string; description?: string }>;
  bricks?: Array<{ id: string }>;
  pages?: Array<{ id: string; icon?: string }>;
}

let cached: { manifest: PluginManifest; rootDir: string } | null = null;

export function loadManifest(): { manifest: PluginManifest; rootDir: string } {
  if (cached) return cached;

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
