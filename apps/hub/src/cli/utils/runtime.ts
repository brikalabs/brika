import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { brikaContext } from '@/runtime/context/brika-context';

/**
 * Re-exports for callers that previously imported these from `runtime.ts`.
 * New code should `import { brikaContext } from '@/runtime/context/brika-context'`
 * and read `brikaContext.installDir` / `brikaContext.brikaDir` directly —
 * one source of truth for "where does this Brika install live?".
 */
export const installDir = brikaContext.installDir;
export const dataDir = brikaContext.brikaDir;

/** Absolute path of a bundled asset next to the binary, or `''` if missing. */
export function detect(asset: string): string {
  const path = join(brikaContext.installDir, asset);
  return existsSync(path) ? path : '';
}

/** Argv prefix to re-invoke the current process (compiled binary vs dev). */
const selfArgv = brikaContext.isCompiled ? [process.execPath] : Bun.argv.slice(0, 2);

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
