/**
 * Process supervisor — coordinates per-service lifecycle (spawn → health
 * → exit → restart) and fans out state events to the TUI.
 *
 * Startup order respects `dependsOn`: a service is queued only once all
 * its deps have reached `healthy`. A failed dep halts the descendants
 * (they stay `pending`); the user sees the failure in the TUI and can
 * fix it then hit `r` to retry.
 *
 * Implementation is intentionally thin: spawn / healthcheck / terminate
 * live in {@link ./lifecycle.ts}, kill-tree / argv-parsing / stream
 * readers each have their own module. This file is the state machine.
 */

import type { Subprocess } from 'bun';
import type { ServiceSpec } from '../config';
import { RING_BUFFER_LINES, SHUTDOWN_RENDER_HOLD_MS } from '../constants';
import { DuplicateServiceIdError } from '../errors';
import { runHealthcheck, spawnService, terminateService } from './lifecycle';
import { parsePortFromLog } from './log-port-parser';
import { isPortListening } from './port-detect';
import { clearRunState, writeRunState } from './run-state';
import type { Listener, ServiceState, ServiceStatus, SupervisorEvent } from './types';

/**
 * Tunables for {@link Supervisor}. Every field has a production-safe
 * default; the options bag exists so the test suite can opt out of
 * UI-only delays (the ink render hold) that otherwise dominate the
 * wall-clock of headless tests.
 */
export interface SupervisorOptions {
  /** Project root passed to spawned services (defaults to `process.cwd()`). */
  readonly projectRoot?: string;
  /**
   * How long {@link Supervisor.shutdown} holds the "all stopped" frame
   * before emitting `shutdown`. Defaults to {@link SHUTDOWN_RENDER_HOLD_MS}
   * so the TUI has time to paint the final ✓ tick. Tests that never
   * mount ink should pass `0`.
   */
  readonly renderHoldMs?: number;
}

/**
 * Mutable variant used internally. Same fields but writable so the
 * supervisor can update state without casting away `readonly`.
 */
interface MutableServiceState {
  spec: ServiceSpec;
  status: ServiceStatus;
  logs: string[];
  revision: number;
  detectedPort: number | null;
}

interface InternalService {
  spec: ServiceSpec;
  state: MutableServiceState;
  proc: Subprocess | null;
  /**
   * Monotonic spawn generation. Bumped on every (re)start so a late exit (or
   * port-probe) from a superseded process can be recognised and ignored,
   * instead of clobbering the freshly-restarted process's status.
   */
  epoch: number;
  healthAbort: AbortController | null;
  /**
   * Authoritative "this service has been stopped" flag, set explicitly
   * when `terminateService` returns. We can't trust `proc.exitCode`
   * alone because Bun updates it asynchronously after SIGKILL — there's
   * a window where the process is dead but `exitCode` is still null.
   */
  terminated: boolean;
}

export class Supervisor {
  private readonly services = new Map<string, InternalService>();
  private readonly listeners = new Set<Listener>();
  private readonly projectRoot: string;
  private readonly renderHoldMs: number;
  private shuttingDown = false;

  constructor(specs: readonly ServiceSpec[], options: SupervisorOptions = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.renderHoldMs = options.renderHoldMs ?? SHUTDOWN_RENDER_HOLD_MS;
    for (const spec of specs) {
      if (this.services.has(spec.id)) {
        throw new DuplicateServiceIdError(spec.id);
      }
      this.services.set(spec.id, {
        spec,
        state: {
          spec,
          status: { kind: 'pending' },
          logs: [],
          revision: 0,
          detectedPort: null,
        },
        proc: null,
        epoch: 0,
        healthAbort: null,
        terminated: false,
      });
    }
  }

  list(): ReadonlyArray<ServiceState> {
    return Array.from(this.services.values()).map((s) => s.state);
  }

  get(serviceId: string): ServiceState | null {
    return this.services.get(serviceId)?.state ?? null;
  }

  /** True between the `'shutting-down'` and `'shutdown'` events. */
  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /** Project root the supervisor was constructed with (read-only). */
  get root(): string {
    return this.projectRoot;
  }

  /**
   * Number of services still considered alive. Mirrors {@link isAlive} so
   * the shutdown overlay's counter and per-service rows agree.
   */
  liveCount(): number {
    let n = 0;
    for (const svc of this.services.values()) {
      if (!svc.proc) {
        continue;
      }
      if (svc.terminated) {
        continue;
      }
      if (svc.proc.exitCode === null) {
        n += 1;
      }
    }
    return n;
  }

  /**
   * True when this service still has a running child process.
   * Used by the shutdown overlay to show per-service "dying / stopped"
   * state — the status field on `ServiceState` is frozen during shutdown
   * (we intentionally don't flip it to `crashed`), so consumers need
   * this orthogonal signal.
   *
   * Honors the explicit `terminated` flag first because `proc.exitCode`
   * is updated by Bun asynchronously after SIGKILL — there's a race
   * window where the process is dead but `exitCode` is still null.
   */
  isAlive(serviceId: string): boolean {
    const svc = this.services.get(serviceId);
    if (!svc?.proc) {
      return false;
    }
    if (svc.terminated) {
      return false;
    }
    return svc.proc.exitCode === null;
  }

  /** True when this service has ever been spawned (`proc` is non-null). */
  hasSpawned(serviceId: string): boolean {
    const svc = this.services.get(serviceId);
    return svc !== undefined && svc.proc !== null;
  }

  /**
   * PIDs of every child still running. Used by the CLI's synchronous
   * last-resort `process.on('exit')` killer, which can't await
   * `shutdown()`.
   */
  livePids(): number[] {
    const pids: number[] = [];
    for (const svc of this.services.values()) {
      const pid = svc.proc?.pid;
      if (pid !== undefined && this.isAlive(svc.spec.id)) {
        pids.push(pid);
      }
    }
    return pids;
  }

  /**
   * Persist the live child set to the run-state file so an UNCLEAN
   * mortar death (kill -9, runtime crash, terminal hard-close) can be
   * recovered by the next session's reaper. Rewritten on every spawn
   * and exit; deleted on clean shutdown.
   */
  private persistRunState(): void {
    const services: Array<{ id: string; pid: number; command: string }> = [];
    for (const svc of this.services.values()) {
      const pid = svc.proc?.pid;
      if (pid !== undefined && this.isAlive(svc.spec.id)) {
        services.push({ id: svc.spec.id, pid, command: svc.spec.command });
      }
    }
    writeRunState(this.projectRoot, { mortarPid: process.pid, services });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Spawn every service that has its dependencies healthy. */
  start(): void {
    this.scheduleReady();
  }

  /**
   * Write `data` to the focused service's stdin. Returns true on
   * successful queue, false when the service isn't running, has no
   * stdin pipe, or the write throws.
   */
  writeStdin(serviceId: string, data: string): boolean {
    const svc = this.services.get(serviceId);
    const proc = svc?.proc;
    if (proc?.exitCode !== null) {
      return false;
    }
    const stdin = proc.stdin;
    // When `stdin` is the inherited fd (number), there's no writer to call.
    // We only ever spawn with `stdin: 'pipe'`, so this is a defensive guard
    // against future config changes — not a path we exercise today.
    if (typeof stdin !== 'object' || stdin === null) {
      return false;
    }
    try {
      stdin.write(data);
      stdin.flush();
      return true;
    } catch {
      return false;
    }
  }

  /** Restart a single service (kill + respawn). Useful for `r` keybind. */
  async restart(serviceId: string): Promise<void> {
    const svc = this.services.get(serviceId);
    if (!svc) {
      return;
    }
    svc.healthAbort?.abort();
    await terminateService(svc.proc);
    svc.state.status = { kind: 'pending' };
    this.bumpState(svc);
    this.scheduleReady();
  }

  /**
   * Restart every service (kill + respawn the whole tree). All children are
   * terminated in parallel, then a single `scheduleReady()` walks the
   * dependency graph so startup order still respects `dependsOn`.
   *
   * No-op while a shutdown is in flight — the user is leaving anyway and
   * spawning fresh children would race the shutdown loop.
   */
  async restartAll(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    const all = Array.from(this.services.values());
    for (const svc of all) {
      svc.healthAbort?.abort();
    }
    await Promise.all(all.map((svc) => terminateService(svc.proc)));
    for (const svc of all) {
      svc.proc = null;
      svc.terminated = false;
      svc.state.detectedPort = null;
      svc.state.status = { kind: 'pending' };
      this.bumpState(svc);
    }
    this.scheduleReady();
  }

  /**
   * SIGTERM every running child + every descendant in their process
   * group, wait the grace period, then SIGKILL leftovers. Idempotent —
   * a second call is a fast no-op.
   *
   * Holds a 400ms "all stopped" frame at the end so the user sees the
   * shutdown overlay flip every service to ✓ before ink unmounts. Without
   * this hold the final render race-loses to the `shutdown` event and the
   * user just watches the spinners disappear with services still labeled
   * "terminating…".
   */
  /** Alias for {@link shutdown} so `await using sup = new Supervisor(...)` cleans up. */
  [Symbol.asyncDispose](): Promise<void> {
    return this.shutdown();
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    this.emit({ kind: 'shutting-down' });
    const live = Array.from(this.services.values()).filter((s) => s.proc !== null);
    for (const svc of live) {
      svc.healthAbort?.abort();
    }
    // Terminate each service in parallel, but emit a per-service state
    // event AS SOON AS terminateService resolves for that one — so the
    // shutdown overlay flips it to ✓ while others are still in flight.
    await Promise.all(
      live.map(async (svc) => {
        await terminateService(svc.proc);
        svc.terminated = true;
        svc.state.revision += 1;
        this.emit({ kind: 'state', serviceId: svc.spec.id });
      })
    );

    // Hold the final "all stopped" frame so ink can paint it before
    // we unmount on the `shutdown` event. Without this hold ink exits
    // the render tree faster than its throttled re-render fires.
    // Tests opt out by constructing the supervisor with `renderHoldMs: 0`.
    if (this.renderHoldMs > 0) {
      await new Promise((r) => setTimeout(r, this.renderHoldMs));
    }

    // Every child is down: the state file has served its purpose. A
    // file left behind here would make the next session's reaper do a
    // pointless (but harmless) PID sweep.
    clearRunState(this.projectRoot);

    this.emit({ kind: 'shutdown' });
  }

  private scheduleReady(): void {
    if (this.shuttingDown) {
      return;
    }
    for (const svc of this.services.values()) {
      if (svc.state.status.kind !== 'pending') {
        continue;
      }
      const depsHealthy = svc.spec.dependsOn.every(
        (dep) => this.services.get(dep)?.state.status.kind === 'healthy'
      );
      if (depsHealthy) {
        this.startOne(svc);
      }
    }
  }

  private startOne(svc: InternalService): void {
    svc.state.status = { kind: 'starting' };
    this.bumpState(svc);
    const epoch = ++svc.epoch;
    try {
      svc.proc = spawnService(svc.spec, this.projectRoot, {
        onLog: (line) => this.appendLog(svc, line),
        onExit: (exitCode, error) => this.onExit(svc, epoch, exitCode, error),
      });
    } catch (err) {
      svc.state.status = {
        kind: 'crashed',
        exitCode: null,
        reason: err instanceof Error ? err.message : String(err),
      };
      this.bumpState(svc);
      return;
    }
    this.persistRunState();
    void this.checkHealth(svc);
  }

  private async checkHealth(svc: InternalService): Promise<void> {
    const ac = new AbortController();
    svc.healthAbort = ac;
    const pid = svc.proc?.pid;
    if (pid === undefined) {
      return;
    }
    try {
      const { detectedPort } = await runHealthcheck(svc.spec, pid, ac.signal);
      if (ac.signal.aborted || svc.state.status.kind === 'crashed') {
        return;
      }
      svc.state.detectedPort = detectedPort;
      svc.state.status = { kind: 'healthy' };
      this.bumpState(svc);
      this.scheduleReady();
    } catch (err) {
      if (ac.signal.aborted) {
        return;
      }
      svc.state.status = {
        kind: 'crashed',
        exitCode: null,
        reason: err instanceof Error ? err.message : String(err),
      };
      this.bumpState(svc);
    }
  }

  private appendLog(svc: InternalService, line: string): void {
    svc.state.logs.push(line);
    if (svc.state.logs.length > RING_BUFFER_LINES) {
      svc.state.logs.splice(0, svc.state.logs.length - RING_BUFFER_LINES);
    }
    this.bumpState(svc);

    // The service literally tells us where it's listening in its own
    // logs ("Listening on http://localhost:5173", etc.). That's far
    // more reliable than walking PID trees or diffing port snapshots.
    // We only do this for `auto` healthchecks that haven't already
    // settled on a port.
    if (
      svc.spec.health.kind === 'auto' &&
      svc.state.detectedPort === null &&
      (svc.state.status.kind === 'starting' || svc.state.status.kind === 'pending')
    ) {
      const port = parsePortFromLog(line);
      if (port !== null) {
        void this.confirmLogPort(svc, port);
      }
    }
  }

  /**
   * Verify a port discovered in the log stream is actually bound,
   * then mark the service healthy. Verification is the cheap
   * `lsof -iTCP:<port>` check — without it, false positives from
   * arbitrary `:NNNN` substrings in logs could mis-mark a service.
   */
  private async confirmLogPort(svc: InternalService, port: number): Promise<void> {
    if (svc.state.detectedPort !== null) {
      return;
    }
    const listening = await isPortListening(port);
    if (!listening) {
      return;
    }
    if (svc.state.detectedPort !== null) {
      return;
    }
    if (this.shuttingDown) {
      return;
    }
    svc.state.detectedPort = port;
    svc.state.status = { kind: 'healthy' };
    // Cancel the ongoing PID-tree poll — we have the answer.
    svc.healthAbort?.abort();
    this.bumpState(svc);
    this.scheduleReady();
  }

  private onExit(
    svc: InternalService,
    epoch: number,
    exitCode: number | null,
    error: Error | undefined
  ): void {
    // Ignore the exit of a process this service has already superseded (e.g. a
    // restart respawned before the old process's exit event landed).
    if (epoch !== svc.epoch) {
      return;
    }
    svc.healthAbort?.abort();
    this.persistRunState();
    if (this.shuttingDown) {
      // Don't mutate status during shutdown — the user shouldn't see
      // "crashed" badges for services they asked to terminate. But DO
      // emit a state event so the shutdown overlay re-renders with the
      // new "stopped" count.
      svc.state.revision += 1;
      this.emit({ kind: 'state', serviceId: svc.spec.id });
      return;
    }
    // Defer the actual crash decision to an async path that can
    // double-check the port. Some wrappers (notably `bun --watch`)
    // exit cleanly while leaving the runtime they supervised still
    // bound — the user sees the service working and would (correctly)
    // be confused by a "crashed" badge.
    void this.classifyExit(svc, epoch, exitCode, error);
  }

  /**
   * Decide whether a wrapper exit means the service is actually dead
   * or just "wrapper-detached":
   *   - if we previously detected a port AND that port is still
   *     listening on the host, the service is alive elsewhere; keep
   *     the existing status (healthy/starting) rather than flip to
   *     crashed.
   *   - otherwise flip to crashed with the parsed exit info.
   */
  private async classifyExit(
    svc: InternalService,
    epoch: number,
    exitCode: number | null,
    error: Error | undefined
  ): Promise<void> {
    const port = svc.state.detectedPort;
    if (port !== null) {
      const stillListening = await isPortListening(port);
      // A restart during the (async) port probe supersedes this exit.
      if (epoch !== svc.epoch) {
        return;
      }
      if (stillListening && !this.shuttingDown) {
        // Service is still up via another process — likely the actual
        // runtime that `bun --watch` (or similar) was supervising. Make
        // sure the status reflects "healthy" so the UI matches reality.
        if (svc.state.status.kind !== 'healthy') {
          svc.state.status = { kind: 'healthy' };
        }
        this.bumpState(svc);
        return;
      }
    }
    if (this.shuttingDown || epoch !== svc.epoch) {
      return;
    }
    svc.state.status = {
      kind: 'crashed',
      exitCode,
      reason: error?.message ?? (exitCode === 0 ? 'exited early' : `exited with code ${exitCode}`),
    };
    this.bumpState(svc);
  }

  private bumpState(svc: InternalService): void {
    svc.state.revision += 1;
    this.emit({ kind: 'state', serviceId: svc.spec.id });
  }

  private emit(event: SupervisorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
