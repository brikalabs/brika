import { join } from 'node:path';
import { OUTPUT_VERSION } from './output-version';

/**
 * Hash all plugin source files + package.json to detect changes.
 * blake2b256, 16 hex chars. Used by both server and client build caches
 * so a single source change invalidates everything consistently.
 *
 * `variant` mixes an extra discriminator into the hash (e.g. the active
 * bundler's `<backend>@<version>`), so artifacts from different backends never
 * collide on one cache key and get cross-served.
 */
export async function hashPluginSources(pluginRoot: string, variant?: string): Promise<string> {
  const glob = new Bun.Glob('src/**/*.{ts,tsx}');
  const paths: string[] = [];
  for await (const path of glob.scan({ cwd: pluginRoot })) {
    paths.push(path);
  }
  paths.sort((a, b) => a.localeCompare(b));

  const hasher = new Bun.CryptoHasher('blake2b256');
  hasher.update(OUTPUT_VERSION);
  if (variant) {
    hasher.update(variant);
  }

  const pkgFile = Bun.file(join(pluginRoot, 'package.json'));
  if (await pkgFile.exists()) {
    hasher.update(await pkgFile.arrayBuffer());
  }

  for (const relPath of paths) {
    hasher.update(relPath);
    hasher.update(await Bun.file(join(pluginRoot, relPath)).arrayBuffer());
  }

  return hasher.digest('hex').slice(0, 16);
}
