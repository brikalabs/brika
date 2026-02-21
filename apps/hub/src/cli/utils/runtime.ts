import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Directory where the binary lives (for detecting bundled assets). */
export const installDir = dirname(process.execPath);

/** Returns the absolute path of a bundled asset next to the binary, or '' if missing. */
export function detect(relativePath: string): string {
  const fullPath = join(installDir, relativePath);
  return existsSync(fullPath) ? fullPath : '';
}

/** Spawn a detached copy of the current CLI with the given args (e.g. `['start', '--foreground']`). */
export function spawnDetached(args: string[]): { pid: number } {
  const child = Bun.spawn([...Bun.argv.slice(0, 2), ...args], {
    env: process.env,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  child.unref();
  return { pid: child.pid };
}
