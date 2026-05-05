import { join } from 'node:path';

/**
 * Bump when compiler output changes for unchanged plugin sources (e.g. a
 * bundler bug fix or a change in how externals are resolved). The bricks
 * route serves bundles with `Cache-Control: immutable`, so the URL hash
 * must change — otherwise browsers keep the stale bundle indefinitely.
 */
const COMPILER_OUTPUT_VERSION = '3';

/**
 * Hash all plugin source files + package.json to detect changes.
 * blake2b256, 16 hex chars. Used by both server and client build caches
 * so a single source change invalidates everything consistently.
 */
export async function hashPluginSources(pluginRoot: string): Promise<string> {
  const glob = new Bun.Glob('src/**/*.{ts,tsx}');
  const paths: string[] = [];
  for await (const path of glob.scan({ cwd: pluginRoot })) {
    paths.push(path);
  }
  paths.sort((a, b) => a.localeCompare(b));

  const hasher = new Bun.CryptoHasher('blake2b256');
  hasher.update(COMPILER_OUTPUT_VERSION);

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
