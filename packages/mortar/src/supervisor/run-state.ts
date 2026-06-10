/**
 * Crash-safe run state. The supervisor records every spawned service
 * PID (plus its own) in `<root>/.mortar-run.json`; the next `mortar
 * start` reads it back and reaps whatever a previous session left
 * behind.
 *
 * Why this exists: the signal handlers in `cli.ts` cover SIGINT /
 * SIGTERM / SIGHUP, but nothing covers `kill -9`, a Bun crash, or a
 * terminal emulator that hard-kills the foreground process. Children
 * are spawned `detached` (own process groups, so one group kill tears
 * a service down), which also means they do NOT die with mortar: an
 * unclean mortar death orphans the whole stack. The state file is the
 * recovery path: stale PIDs are verified against their recorded
 * command line (guards against PID reuse) and then tree-killed.
 *
 * Hand-rolled JSON validation on purpose, same reasoning as
 * `config/validate.ts`: not worth a schema dependency for one file.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHUTDOWN_GRACE_MS } from '../constants';
import { killPidTree } from './kill-tree';

const RUN_STATE_FILE = '.mortar-run.json';

export interface RunStateEntry {
  readonly id: string;
  readonly pid: number;
  readonly command: string;
}

export interface RunState {
  readonly mortarPid: number;
  readonly services: readonly RunStateEntry[];
}

export type ReapResult =
  /** No state file: nothing to do. */
  | { kind: 'clean' }
  /** Another live mortar session owns this stack. */
  | { kind: 'active'; mortarPid: number }
  /** Previous session died unclean; `reaped` orphans were killed. */
  | { kind: 'reaped'; reaped: number };

export function runStatePath(root: string): string {
  return join(root, RUN_STATE_FILE);
}

/** Atomically (best-effort) persist the current live-service set. */
export function writeRunState(root: string, state: RunState): void {
  try {
    writeFileSync(runStatePath(root), `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // A read-only root must not take the stack down; the reaper just
    // won't have data next time.
  }
}

/** Remove the state file (clean shutdown path). */
export function clearRunState(root: string): void {
  rmSync(runStatePath(root), { force: true });
}

export function readRunState(root: string): RunState | null {
  const path = runStatePath(root);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parseRunState(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    // Corrupt or half-written (we may have died mid-write): discard.
    return null;
  }
}

/**
 * Reap whatever a previous mortar session left running.
 *
 * - No state file: `clean`.
 * - State file whose `mortarPid` is still a live mortar process:
 *   `active` (the caller should refuse to start a second session on
 *   the same stack; the ports would collide anyway).
 * - Otherwise: every recorded service PID that is still alive AND
 *   still runs the recorded command (PID-reuse guard) gets a
 *   SIGTERM tree-kill, a grace period, then a SIGKILL tree-kill.
 */
export async function reapStaleRun(root: string): Promise<ReapResult> {
  const state = readRunState(root);
  if (!state) {
    return { kind: 'clean' };
  }
  const ownerCommand = await psCommand(state.mortarPid);
  if (ownerCommand?.includes('mortar') && state.mortarPid !== process.pid) {
    return { kind: 'active', mortarPid: state.mortarPid };
  }

  const stale: RunStateEntry[] = [];
  for (const entry of state.services) {
    const command = await psCommand(entry.pid);
    if (command !== null && commandMatches(command, entry.command)) {
      stale.push(entry);
    }
  }
  await Promise.all(stale.map((entry) => killPidTree(entry.pid, 'SIGTERM')));
  if (stale.length > 0) {
    await Bun.sleep(reapGraceMs());
    await Promise.all(stale.map((entry) => killPidTree(entry.pid, 'SIGKILL')));
  }
  clearRunState(root);
  return { kind: 'reaped', reaped: stale.length };
}

/**
 * Grace between the polite and the forced pass. Overridable via env so
 * tests don't sit through the full production grace period.
 */
function reapGraceMs(): number {
  const fromEnv = Number.parseInt(process.env.MORTAR_REAP_GRACE_MS ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : SHUTDOWN_GRACE_MS;
}

/**
 * The live command line of `pid`, or null when the process is gone.
 * `ps -p <pid> -o command=` is portable across macOS and Linux.
 */
async function psCommand(pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  try {
    const proc = Bun.spawn(['ps', '-p', String(pid), '-o', 'command='], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const text = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) {
      return null;
    }
    const line = text.trim();
    return line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

/**
 * PID-reuse guard: only treat the process as ours when its current
 * command line still contains the command we spawned it with. Loose
 * containment (not equality) because shells and runtimes may prefix
 * the argv (`/path/to/bun --watch src/main.ts` vs `bun --watch
 * src/main.ts`).
 */
function commandMatches(liveCommand: string, recordedCommand: string): boolean {
  return liveCommand.includes(recordedCommand.trim());
}

// ─── State-file parsing ─────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRunState(input: unknown): RunState | null {
  if (!isRecord(input)) {
    return null;
  }
  const obj = input;
  const mortarPid = obj.mortarPid;
  if (typeof mortarPid !== 'number' || !Number.isInteger(mortarPid)) {
    return null;
  }
  if (!Array.isArray(obj.services)) {
    return null;
  }
  const services: RunStateEntry[] = [];
  for (const raw of obj.services) {
    const entry = parseEntry(raw);
    if (entry) {
      services.push(entry);
    }
  }
  return { mortarPid, services };
}

function parseEntry(input: unknown): RunStateEntry | null {
  if (!isRecord(input)) {
    return null;
  }
  const obj = input;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.pid !== 'number' ||
    !Number.isInteger(obj.pid) ||
    typeof obj.command !== 'string'
  ) {
    return null;
  }
  return { id: obj.id, pid: obj.pid, command: obj.command };
}
