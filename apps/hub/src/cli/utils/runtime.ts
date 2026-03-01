import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const isCompiled = import.meta.path.startsWith('/$bunfs/');

/** Directory where the binary lives (e.g., ~/.brika/bin). */
export const installDir = dirname(process.execPath);

/**
 * Root data directory for Brika state (PID file, database, etc.).
 * Precedence: BRIKA_HOME env var → auto-detect from binary / cwd.
 * Production: parent of installDir (e.g., ~/.brika/bin → ~/.brika).
 * Dev: .brika in the current working directory.
 */
export const dataDir =
  process.env.BRIKA_HOME ?? (isCompiled ? dirname(installDir) : join(process.cwd(), '.brika'));

/** Absolute path of a bundled asset next to the binary, or `''` if missing. */
export function detect(asset: string): string {
  const path = join(installDir, asset);
  return existsSync(path) ? path : '';
}

/** Argv prefix to re-invoke the current process (compiled binary vs dev). */
const selfArgv = isCompiled ? [process.execPath] : Bun.argv.slice(0, 2);

/** Spawn a detached child re-invoking this CLI with the given args. */
export function spawnDetached(args: string[]): {
  pid: number;
} {
  const child = Bun.spawn([...selfArgv, ...args], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  });
  child.unref();
  return {
    pid: child.pid,
  };
}

/**
 * Exit code the hub uses to signal the supervisor to restart it.
 * Any other exit code (0, crash, SIGTERM) stops the supervisor loop.
 */
export const RESTART_CODE = 42;

/**
 * Spawn the hub as a supervised child with inherited stdio.
 * The child shares the supervisor's terminal session.
 */
export function spawnHub(
  args: string[],
  env: Record<string, string | undefined>
): ReturnType<typeof Bun.spawn> {
  return Bun.spawn([...selfArgv, ...args], {
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
}
