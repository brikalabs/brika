import { join } from 'node:path';
import type { FsBackingDirs } from './grants/fs/types';

/**
 * Resolve the four host directories backing a plugin's virtual fs roots
 * WITHOUT creating them. `/bundle` is the install dir (read-only);
 * `/data`, `/cache`, `/tmp` live under `<brikaDir>/plugins-data/<uid>/`.
 *
 * `allocateFsDirs` (plugin-lifecycle) wraps this and `mkdir`s the writable
 * roots at load time; read-only consumers (e.g. the disk-usage endpoint, for
 * stopped plugins) resolve the same paths through here without side effects.
 */
export function pluginFsDirs(brikaDir: string, uid: string, rootDirectory: string): FsBackingDirs {
  const base = join(brikaDir, 'plugins-data', uid);
  return {
    bundle: rootDirectory,
    data: join(base, 'data'),
    cache: join(base, 'cache'),
    tmp: join(base, 'tmp'),
  };
}
