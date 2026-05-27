/**
 * Supervisor loop for standalone installs.
 *
 * `brika start` detaches a supervisor process which then spawns
 * `brika hub` as a managed child. When the hub exits with
 * {@link RESTART_CODE} (42) — the sentinel the orchestrator's
 * `markRestartPending()` flow + `POST /api/system/restart` use — the
 * supervisor respawns it. Any other exit code (0 for clean stop,
 * crash, signal) tears the supervisor down too.
 *
 * Without this, `brika update` and the UI restart button would kill
 * the hub permanently on standalone installs (`brika start` only
 * forks the hub once). Container + system-package modes don't need
 * this because the OS supervisor (docker/k8s/systemd) plays the role.
 *
 * Signal handling: the supervisor forwards SIGTERM / SIGINT to its
 * child so external `kill <supervisor-pid>` cascades. SIGKILL can't
 * be trapped — the child becomes an orphan in that case, but the
 * hub's own trap-signals plugin still shuts it down via its own
 * signal handlers if you target the hub pid directly.
 */

import { resolveSelfSpawnArgs } from './hub-spawn-detached';

/** Mirror of `RESTART_CODE` from `@brika/hub/runtime/restart-code` — duplicated
 *  here to keep the supervisor free of hub imports (it needs to survive
 *  across hub binary swaps in staged updates). */
const RESTART_CODE = 42;

/** Cap to stop a crash-looping hub from hot-spinning the supervisor. */
const MAX_RESTARTS_PER_WINDOW = 5;
const RESTART_WINDOW_MS = 60_000;

export async function runHubSupervisorLoop(): Promise<number> {
  const restartTimestamps: number[] = [];

  while (true) {
    const child = Bun.spawn(resolveSelfSpawnArgs(), {
      env: process.env as Record<string, string>,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const forward = (sig: NodeJS.Signals) => child.kill(sig);
    process.on('SIGTERM', forward);
    process.on('SIGINT', forward);

    const code = await child.exited;

    process.off('SIGTERM', forward);
    process.off('SIGINT', forward);

    if (code !== RESTART_CODE) {
      return code ?? 1;
    }

    // Restart was requested. Throttle so a child that exits 42
    // immediately on boot can't spin the supervisor CPU-hot.
    const now = Date.now();
    while (restartTimestamps.length > 0 && now - (restartTimestamps[0] ?? 0) > RESTART_WINDOW_MS) {
      restartTimestamps.shift();
    }
    restartTimestamps.push(now);
    if (restartTimestamps.length > MAX_RESTARTS_PER_WINDOW) {
      process.stderr.write(
        `brika supervisor: hub requested ${restartTimestamps.length} restarts in ${RESTART_WINDOW_MS / 1000}s — giving up.\n`
      );
      return 1;
    }
  }
}
