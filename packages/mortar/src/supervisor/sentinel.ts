#!/usr/bin/env bun

/**
 * Sentinel reap entry point: the second half of mortar's orphan
 * insurance.
 *
 * `cli.ts` spawns a detached `/bin/sh` watcher per session that polls
 * `kill -0 <mortarPid>` once a second (a shell loop instead of a Bun
 * process so the watcher costs ~1 MB, not a full runtime). When mortar
 * disappears, the shell waits out the shutdown grace period and execs
 * THIS script.
 *
 * By the time we run, one of three things is true:
 *   - mortar shut down cleanly: the run-state file is gone,
 *     `reapStaleRun` reads nothing and we exit.
 *   - mortar died unclean (kill -9, crash, hard terminal close): the
 *     file lists the orphaned services and `reapStaleRun` tree-kills
 *     every PID that still matches its recorded command line.
 *   - a NEW mortar session already took over: the file's `mortarPid`
 *     is alive, `reapStaleRun` reports `active` and we touch nothing.
 *
 * So running this is always safe; it exists to make orphan cleanup
 * happen seconds after an unclean death instead of at the next
 * `mortar start`.
 */

import { reapStaleRun } from './run-state';

const root = process.argv[2];
if (!root) {
  process.exit(2);
}
await reapStaleRun(root);
