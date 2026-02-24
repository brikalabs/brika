/**
 * Build Info
 *
 * Uses Bun macros to inline git info at transpile time.
 * Works in both dev mode (`bun --watch`) and compiled builds (`Bun.build()`).
 * No runtime git dependency.
 */

import {
  getBuildDate,
  getGitBranch,
  getGitCommit,
  getGitCommitFull,
} from './build-info.macro' with { type: 'macro' };

export const buildInfo = {
  commit: getGitCommit(),
  commitFull: getGitCommitFull(),
  branch: getGitBranch(),
  date: getBuildDate(),
};
