/**
 * Staged install — atomic "boot-once, validate, commit" binary swap.
 *
 * The legacy `replaceInstallation` flow renamed the live binary to
 * `brika.bak`, wrote the new binary, then *immediately deleted the
 * backup*. If the new binary crashed on first boot the user was hard
 * stuck: no `brika` to run, no `brika.bak` to fall back on.
 *
 * Staged install closes that gap. The sequence becomes:
 *
 *   1. Write the new binary to `brika.next` (live `brika` untouched).
 *   2. Spawn `brika.next --self-check` with a 5 s timeout. The probe
 *      writes one JSON line on stdout (`{ok: true, version}`) and
 *      exits 0 — anything else (crash, hang, exit != 0, non-JSON)
 *      counts as a failure.
 *   3. On failure: delete `brika.next`, throw. Live binary untouched.
 *   4. On success:
 *        - rename live `brika`     → `brika.previous`  (kept!)
 *        - rename `brika.next`     → `brika`           (atomic on POSIX)
 *      Same for the `ui/` bundle.
 *
 * `brika.previous` is *not* deleted until the next boot calls
 * {@link clearPreviousBackup} after recording boot success — that's the
 * "rollback window". If the new binary crashes during onStart instead
 * of self-check, `boot-rollback.ts` swaps `brika.previous` back over
 * `brika` and the user is on their working version again.
 *
 * Windows: file locking on the running EXE prevents the same in-process
 * rename trick that works on POSIX. For now Windows falls back to the
 * legacy in-place behavior (still wrapped by `cmd /c move`, supervisor
 * restart). A Windows-native supervisor handoff is a follow-up.
 */

import { chmodSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { z } from 'zod';

const SelfCheckResultSchema = z.object({
  ok: z.literal(true),
  version: z.string().min(1),
});

const SELF_CHECK_TIMEOUT_MS = 5_000;

export interface StageInstallOptions {
  /** Source dir produced by archive extraction; contains `brika`/`brika.exe` + `ui/`. */
  readonly sourceDir: string;
  /** Directory where the live binary lives; usually `dirname(process.execPath)`. */
  readonly installDir: string;
  /** Set to true on Windows or any platform where we can't rename the live exe. */
  readonly skipStaging?: boolean;
}

const BINARY_BASENAME = 'brika';
const NEXT_SUFFIX = '.next';
const PREVIOUS_SUFFIX = '.previous';

function binaryName(): string {
  return process.platform === 'win32' ? `${BINARY_BASENAME}.exe` : BINARY_BASENAME;
}

export function liveBinaryPath(installDir: string): string {
  return join(installDir, binaryName());
}

export function nextBinaryPath(installDir: string): string {
  return `${liveBinaryPath(installDir)}${NEXT_SUFFIX}`;
}

export function previousBinaryPath(installDir: string): string {
  return `${liveBinaryPath(installDir)}${PREVIOUS_SUFFIX}`;
}

function liveUiDir(installDir: string): string {
  return join(installDir, 'ui');
}
function nextUiDir(installDir: string): string {
  return `${liveUiDir(installDir)}${NEXT_SUFFIX}`;
}
function previousUiDir(installDir: string): string {
  return `${liveUiDir(installDir)}${PREVIOUS_SUFFIX}`;
}

/**
 * Copy the new binary + UI bundle to staging paths *next to* the live
 * install. Returns the staged binary path so callers can spawn it for
 * self-check.
 */
export async function stageArtifacts(opts: StageInstallOptions): Promise<{ stagedBinary: string }> {
  const stagedBinary = nextBinaryPath(opts.installDir);
  const sourceBinary = join(opts.sourceDir, binaryName());
  if (!existsSync(sourceBinary)) {
    throw new Error(`Source archive missing ${binaryName()} at ${sourceBinary}`);
  }

  // Atomic enough for a single file — write to `*.next.tmp` then rename.
  // Avoids leaving a half-written `.next` if the copy is interrupted.
  const tmpBinary = `${stagedBinary}.tmp`;
  rmSync(tmpBinary, { force: true });
  await Bun.write(tmpBinary, Bun.file(sourceBinary));
  // Preserve executable bit on POSIX.
  if (process.platform !== 'win32') {
    chmodSync(tmpBinary, 0o755);
  }
  rmSync(stagedBinary, { force: true });
  renameSync(resolvePath(tmpBinary), resolvePath(stagedBinary));

  // Stage the UI bundle if present in the archive.
  const sourceUi = join(opts.sourceDir, 'ui');
  if (existsSync(sourceUi)) {
    const stagedUi = nextUiDir(opts.installDir);
    rmSync(stagedUi, { recursive: true, force: true });
    mkdirSync(dirname(stagedUi), { recursive: true });
    cpSync(sourceUi, stagedUi, { recursive: true });
  }

  return { stagedBinary };
}

/**
 * Spawn `<staged binary> --self-check` and parse the JSON result.
 * Returns the result on success; throws on any failure (timeout,
 * non-zero exit, garbage stdout).
 */
export async function runStagedSelfCheck(stagedBinary: string): Promise<{ version: string }> {
  const proc = Bun.spawn([stagedBinary, '--self-check'], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: SELF_CHECK_TIMEOUT_MS,
  });

  // Bun.spawn's `timeout` kills the process; `exited` resolves with the exit code.
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = (await new Response(proc.stderr).text()).trim();
    const suffix = stderr.length > 0 ? `: ${stderr}` : '';
    throw new Error(`Self-check exited with code ${exitCode}${suffix}`);
  }

  const stdout = (await new Response(proc.stdout).text()).trim();
  // Expect exactly one JSON line. Tolerate trailing newlines, reject extra noise.
  const firstLine = stdout.split('\n')[0] ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    throw new Error(`Self-check stdout was not JSON: ${firstLine.slice(0, 80)}`);
  }
  const validated = SelfCheckResultSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Self-check returned non-ok result: ${firstLine.slice(0, 200)}`);
  }
  return { version: validated.data.version };
}

/**
 * Atomic swap: rename live → previous, staged → live. POSIX only —
 * Windows runs the legacy path (caller passes `skipStaging: true`).
 *
 * Ordering matters. We commit the UI bundle FIRST, then the binary:
 *
 *   - If the UI swap fails, the new binary was never installed, so
 *     the supervisor restarts on the old binary + old UI. Consistent.
 *   - If the UI swap succeeds and the binary swap fails, we have new
 *     UI + old binary. Slightly mismatched, but the system is still
 *     bootable — the old binary serves the new UI (which is forward-
 *     compatible since UIs accompany binaries and the JSON API
 *     contract is the binary's responsibility).
 *   - Binary-first ordering had the opposite hazard: new binary + old
 *     UI was a worse failure mode because the UI's client-side code
 *     might call API endpoints the new binary doesn't have.
 *
 * Power-loss between the two renames leaves a bootable system
 * either way; the next boot reconciles via `recordBootSuccess`
 * cleanup of `.previous`.
 */
export function commitStagedArtifacts(installDir: string): void {
  const stagedUi = nextUiDir(installDir);
  if (existsSync(stagedUi)) {
    const liveUi = liveUiDir(installDir);
    const previousUi = previousUiDir(installDir);
    rmSync(previousUi, { recursive: true, force: true });
    if (existsSync(liveUi)) {
      renameSync(liveUi, previousUi);
    }
    renameSync(stagedUi, liveUi);
  }

  const live = liveBinaryPath(installDir);
  const previous = previousBinaryPath(installDir);
  const next = nextBinaryPath(installDir);
  // Clear any stale `.previous` from an earlier upgrade that already
  // closed its rollback window. We're about to write a fresh one.
  rmSync(previous, { force: true });
  renameSync(live, previous);
  renameSync(next, live);
}

/**
 * Best-effort cleanup of staged artifacts after a failed self-check or
 * download. Safe to call when nothing is staged.
 */
export function discardStagedArtifacts(installDir: string): void {
  rmSync(nextBinaryPath(installDir), { force: true });
  rmSync(`${nextBinaryPath(installDir)}.tmp`, { force: true });
  rmSync(nextUiDir(installDir), { recursive: true, force: true });
}

/**
 * Delete the `.previous` backups. Called after the orchestrator records
 * a successful boot — at that point the new binary has proven it can
 * run through `onStart`, and the rollback window is closed.
 */
export function clearPreviousBackup(installDir: string): void {
  rmSync(previousBinaryPath(installDir), { force: true });
  rmSync(previousUiDir(installDir), { recursive: true, force: true });
}

/** True if a `.previous` backup is on disk — i.e. a rollback is possible. */
export function hasPreviousBackup(installDir: string): boolean {
  return existsSync(previousBinaryPath(installDir));
}
