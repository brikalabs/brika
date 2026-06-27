import { join } from 'node:path';
import type { FsBackingDirs } from './grants/fs/types';

/**
 * Container for per-plugin writable storage, relative to the hub-managed
 * `systemDir`. Lives under `<systemDir>/plugins/data/`, so everything
 * plugin-related (the `node_modules` bundle and each plugin's data/cache/tmp)
 * sits under one `plugins/` tree. Returns the root WITHOUT a uid, for callers
 * that enumerate or prune every plugin (disk usage, the boot prune migration).
 */
export function pluginDataDir(systemDir: string): string {
  return join(systemDir, 'plugins', 'data');
}

/**
 * Resolve the four host directories backing a plugin's virtual fs roots
 * WITHOUT creating them. `/bundle` is the install dir (read-only);
 * `/data`, `/cache`, `/tmp` live under `<systemDir>/plugins/data/<uid>/`.
 *
 * `allocateFsDirs` (plugin-lifecycle) wraps this and `mkdir`s the writable
 * roots at load time; read-only consumers (e.g. the disk-usage endpoint, for
 * stopped plugins) resolve the same paths through here without side effects.
 */
export function pluginFsDirs(systemDir: string, uid: string, rootDirectory: string): FsBackingDirs {
  const base = join(pluginDataDir(systemDir), uid);
  return {
    bundle: rootDirectory,
    data: join(base, 'data'),
    cache: join(base, 'cache'),
    tmp: join(base, 'tmp'),
  };
}
