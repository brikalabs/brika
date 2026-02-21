import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Directory where the binary lives (for detecting bundled assets). */
export const installDir = dirname(process.execPath);

/** Absolute path of a bundled asset next to the binary, or `''` if missing. */
export function detect(asset: string): string {
  const path = join(installDir, asset);
  return existsSync(path) ? path : '';
}

/** Argv prefix to re-invoke the current process (compiled binary vs dev). */
const selfArgv = import.meta.path.startsWith('/$bunfs/')
  ? [process.execPath]
  : Bun.argv.slice(0, 2);

/** Spawn a detached child re-invoking this CLI with the given args. */
export function spawnDetached(args: string[]): { pid: number } {
  const child = Bun.spawn([...selfArgv, ...args], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  child.unref();
  return { pid: child.pid };
}
