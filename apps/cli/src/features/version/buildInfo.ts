import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface BuildInfo {
  readonly branch: string | null;
  readonly commit: string | null;
  readonly commitDate: string | null;
}

export const EMPTY_BUILD_INFO: BuildInfo = { branch: null, commit: null, commitDate: null };

export function readBuildInfo(): BuildInfo {
  // No `.git/` next to us means this is a packaged binary, not a dev
  // checkout — skip the spawn entirely so we never invoke a binary
  // resolved via PATH outside a source tree we control.
  if (!existsSync(join(process.cwd(), '.git'))) {
    return EMPTY_BUILD_INFO;
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const isoDate = git(['log', '-1', '--format=%cI']);
  return {
    branch,
    commit,
    commitDate: isoDate ? isoDate.slice(0, 10) : null,
  };
}

export function git(args: ReadonlyArray<string>): string | null {
  // PATH lookup is the user's own — `brika version` is an interactive
  // command run from a developer's shell, not a setuid context.
  const result = spawnSync('git', [...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) {
    return null;
  }
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
}
