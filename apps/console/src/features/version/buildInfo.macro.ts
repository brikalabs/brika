/**
 * Build-time-resolved build info — these functions run *during* the
 * Bun build (via `with { type: 'macro' }`) and their string return
 * values are inlined as constants in the bundle. The compiled binary
 * therefore knows its commit / branch / build date with no runtime
 * `.git` snooping or `git` subprocess.
 *
 * Mirrors `apps/hub/src/build-info.macro.ts` — same envelope, kept
 * local so the console package doesn't have to import build-time
 * macros across package boundaries.
 */

export function getGitCommitShort(): string {
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

/** ISO timestamp captured at build time — the moment Bun bundled this
 *  binary, not the commit's author/committer date. */
export function getBuildDate(): string {
  return new Date().toISOString();
}

/** Short ISO date (`YYYY-MM-DD`) of the HEAD commit. */
export function getGitCommitDate(): string {
  try {
    const { stdout, exitCode } = Bun.spawnSync({
      cmd: ['git', 'log', '-1', '--format=%cs'],
      stdout: 'pipe',
    });
    return exitCode === 0 ? stdout.toString().trim() : '';
  } catch {
    return '';
  }
}
