/**
 * Build Info Macros
 *
 * These functions are executed at bundle-time using Bun macros.
 * The return values are inlined directly into the bundle.
 */

export function getGitCommit(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'rev-parse', '--short', 'HEAD'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Full 40-char git commit SHA — used for exact build identification. */
export function getGitCommitFull(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'rev-parse', 'HEAD'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getGitBranch(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function getBuildDate(): string {
  return new Date().toISOString();
}
