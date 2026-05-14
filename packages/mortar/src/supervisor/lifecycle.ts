/**
 * Per-service lifecycle: spawn, healthcheck, terminate. Pure functions
 * that the {@link Supervisor} coordinator wires together.
 *
 * Extracted so `Supervisor.ts` only contains state-machine code (dep
 * resolution, event fan-out) and doesn't drown in Bun.spawn / kill /
 * health-poll plumbing.
 */

import { resolve } from 'node:path';
import type { Subprocess } from 'bun';
import type { ServiceSpec } from '../config';
import { SHUTDOWN_GRACE_MS } from '../constants';
import { splitCommand } from './command-parser';
import { waitForHttp, waitForTcp } from './health';
import { killTree } from './kill-tree';
import { waitForListeningPort } from './port-detect';
import { readStream, stripFilterPrefix } from './stream-reader';

export interface SpawnHandlers {
  readonly onLog: (line: string) => void;
  readonly onExit: (exitCode: number | null, error: Error | undefined) => void;
}

/**
 * Spawn one service. Throws `CommandParseError` if `spec.command` is
 * malformed (the caller transitions the service to `crashed`).
 *
 * `detached: true` makes the child a process-group leader so the whole
 * tree can be torn down with `kill(-pgid)` at shutdown. `stdin: 'pipe'`
 * is required for the TUI's input-forwarding mode.
 */
export function spawnService(
  spec: ServiceSpec,
  projectRoot: string,
  handlers: SpawnHandlers
): Subprocess {
  const argv = splitCommand(spec.command);
  const proc = Bun.spawn(argv, {
    cwd: spec.cwd ? resolve(projectRoot, spec.cwd) : projectRoot,
    // FORCE_COLOR=1 first so children (vite, chalk, picocolors, etc.)
    // emit ANSI even though we pipe their stdout. The user's process.env
    // overrides if they've explicitly set NO_COLOR / FORCE_COLOR=0, and
    // per-service env overrides that.
    env: { FORCE_COLOR: '1', ...process.env, ...spec.env },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
    detached: true,
    onExit: (_p, exitCode, _signal, error) => {
      handlers.onExit(exitCode, error);
    },
  });
  consumeStream(proc.stdout, handlers.onLog);
  consumeStream(proc.stderr, handlers.onLog);
  return proc;
}

function consumeStream(
  stream: ReadableStream<Uint8Array> | null,
  onLog: (line: string) => void
): void {
  if (!stream) {
    return;
  }
  void readStream(stream, (line) => onLog(stripFilterPrefix(line)));
}

export interface HealthcheckResult {
  /** Port observed listening on (only set for `health: auto`). */
  readonly detectedPort: number | null;
}

/**
 * Run the configured healthcheck. Resolves once the service is reachable
 * (or immediately for `health: none`), rejects on timeout / abort.
 *
 * For `auto`, this is a best-effort PID-tree walk. A more reliable
 * answer comes from the user declaring `port:` in the service config
 * (auto-promoted to `tcp` in the validator) or, failing that, mortar's
 * log-line port parser running in parallel inside the supervisor.
 */
export async function runHealthcheck(
  spec: ServiceSpec,
  pid: number,
  signal: AbortSignal
): Promise<HealthcheckResult> {
  const health = spec.health;
  if (health.kind === 'http') {
    await waitForHttp(health.url, health.timeoutMs, signal);
    return { detectedPort: null };
  }
  if (health.kind === 'tcp') {
    await waitForTcp(health.port, health.timeoutMs, signal);
    return { detectedPort: health.port };
  }
  if (health.kind === 'auto') {
    const port = await waitForListeningPort(pid, health.timeoutMs, signal);
    return { detectedPort: port };
  }
  return { detectedPort: null };
}

/**
 * SIGTERM the process tree, wait up to {@link SHUTDOWN_GRACE_MS} for a
 * clean exit, then SIGKILL anything left. Idempotent — calling on an
 * already-dead process is a fast no-op.
 */
export async function terminateService(proc: Subprocess | null): Promise<void> {
  if (!proc || proc.exitCode !== null) {
    return;
  }
  await killTree(proc, 'SIGTERM');
  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await killTree(proc, 'SIGKILL');
}
