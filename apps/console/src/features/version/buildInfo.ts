/**
 * Compile-time build info baked into the binary via Bun macros.
 *
 * In dev (`bun run src/main.ts`) the macro evaluates each launch, so
 * values reflect the live working tree. In a compiled binary the
 * values are frozen at the moment `bun build --compile` ran — which
 * is what the operator actually wants `brika version` to show.
 *
 * `null` rather than `'unknown'` is the consumer-facing shape so the
 * version view can cleanly skip rows that aren't available (e.g.
 * source-less installs that never had a `.git` to inspect).
 */

import {
  getBuildDate,
  getGitBranch,
  getGitCommitDate,
  getGitCommitFull,
  getGitCommitShort,
} from './buildInfo.macro' with { type: 'macro' };

export interface BuildInfo {
  readonly branch: string | null;
  /** 7-char short SHA. */
  readonly commit: string | null;
  /** Full 40-char SHA — exposed for exact match in logs / issues. */
  readonly commitFull: string | null;
  /** Short ISO date (`YYYY-MM-DD`) of the HEAD commit. */
  readonly commitDate: string | null;
  /** Full ISO timestamp captured the moment Bun bundled the binary. */
  readonly buildTime: string | null;
}

function nullable(value: string): string | null {
  return value && value !== 'unknown' ? value : null;
}

const RAW: BuildInfo = {
  branch: nullable(getGitBranch()),
  commit: nullable(getGitCommitShort()),
  commitFull: nullable(getGitCommitFull()),
  commitDate: nullable(getGitCommitDate()),
  buildTime: nullable(getBuildDate()),
};

export const BUILD_INFO: BuildInfo = RAW;

/** Backwards-compatible accessor. Always returns the baked-in info. */
export function readBuildInfo(): BuildInfo {
  return BUILD_INFO;
}
