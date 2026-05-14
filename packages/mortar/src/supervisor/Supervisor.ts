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
import type { Listener, ServiceState, ServiceStatus, SupervisorEvent } from './types';

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
  private shuttingDown = false;

  constructor(
    specs: readonly ServiceSpec[],
    private readonly projectRoot: string = process.cwd()
  ) {
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
    await new Promise((r) => setTimeout(r, SHUTDOWN_RENDER_HOLD_MS));

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
    try {
      svc.proc = spawnService(svc.spec, this.projectRoot, {
        onLog: (line) => this.appendLog(svc, line),
        onExit: (exitCode, error) => this.onExit(svc, exitCode, error),
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

  private onExit(svc: InternalService, exitCode: number | null, error: Error | undefined): void {
    svc.healthAbort?.abort();
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
    void this.classifyExit(svc, exitCode, error);
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
    exitCode: number | null,
    error: Error | undefined
  ): Promise<void> {
    const port = svc.state.detectedPort;
    if (port !== null) {
      const stillListening = await isPortListening(port);
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
    if (this.shuttingDown) {
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
