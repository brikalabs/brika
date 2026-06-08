/**
 * `grant.request` dispatch — extracted from `PluginProcess` so the
 * watchdog + jitter + vector-lookup branch is unit-testable without
 * having to spin up an IPC channel.
 *
 * The PluginProcess wire handler is now a thin wrapper around
 * `dispatchGrantRequest`; everything stateful (registry, vector builder,
 * lifetime abort) is passed in.
 */

import { errors } from '@brika/errors';
import type { GrantId, GrantRegistry } from '@brika/grants';

/** Hub-side hard timeout for a single grant.request. */
export const GRANT_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Maximum jitter (in ms) added before the grant/deny branch fires.
 * Neutralizes an application-layer timing oracle a malicious plugin
 * could use to fingerprint the vector by measuring call latency
 * (denial throws instantly, success runs the handler).
 *
 * Set to 0 — `Bun.sleep(0)` still yields to the event loop, so the
 * deny branch still goes through one microtask boundary, but we no
 * longer pay 0–5 ms on the hot path of every dispatch. Re-raise to a
 * non-zero value (via plugin-process or a config flag) once the
 * platform threat model justifies it (e.g. third-party marketplace).
 */
export const GRANT_REQUEST_JITTER_MAX_MS = 0;

/**
 * Yield the event loop before the grant/deny branch. When the jitter
 * max is 0 this collapses to `Bun.sleep(0)` — still a microtask
 * boundary, but no measurable delay. When non-zero it uses
 * `crypto.getRandomValues` so a side channel can't predict the sample.
 */
export function jitterDelay(): Promise<void> {
  if (GRANT_REQUEST_JITTER_MAX_MS === 0) {
    return Bun.sleep(0);
  }
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  const sample = buf[0] ?? 0;
  const ms = Math.floor((sample / 0xffff) * GRANT_REQUEST_JITTER_MAX_MS);
  return Bun.sleep(ms);
}

export interface DispatchDeps {
  /** Per-plugin grant registry. */
  readonly registry: GrantRegistry;
  /** Lazily-rebuilt vector — recomputed on every dispatch so a permission
   *  edit is picked up before the next call fires. */
  readonly buildVector: () => {
    readonly grants: ReadonlyArray<{
      readonly id: GrantId;
      readonly ctxPath: string;
      readonly scope?: unknown;
    }>;
  };
  /** Plugin identity passed through to the handler context. */
  readonly pluginUid: string;
  readonly pluginRoot: string;
  /** Hub-scoped logger. */
  readonly log: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
  /** Process lifetime signal — fires on plugin stop / disconnect. */
  readonly lifetimeSignal: AbortSignal;
}

export interface DispatchOptions {
  /** Override the watchdog timeout. Tests use a short value; prod uses the constant. */
  readonly timeoutMs?: number;
  /** Override jitter (tests skip it for determinism). */
  readonly skipJitter?: boolean;
}

/**
 * Run a single `grant.request` end-to-end. Throws on denial, watchdog
 * timeout, or any error the registry surfaces; the caller (the wire
 * handler) translates the throw into the IPC error envelope.
 *
 * The branch order is deliberate: vector recompute + jitter BOTH run
 * regardless of grant/deny, so wall-time cost of denial matches the
 * wall-time cost of a permitted call up to dispatch.
 */
export async function dispatchGrantRequest(
  deps: DispatchDeps,
  call: { readonly id: string; readonly args: unknown },
  opts: DispatchOptions = {}
): Promise<{ readonly result: unknown }> {
  const vector = deps.buildVector();
  const entry = vector.grants.find((g) => g.id === call.id);
  if (!opts.skipJitter) {
    await jitterDelay();
  }
  if (!entry) {
    throw errors.permissionDenied({ permission: call.id });
  }
  const timeoutMs = opts.timeoutMs ?? GRANT_REQUEST_TIMEOUT_MS;
  const watchdog = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([deps.lifetimeSignal, watchdog]);
  const dispatched = deps.registry.dispatch(call.id, call.args, {
    pluginUid: deps.pluginUid,
    pluginRoot: deps.pluginRoot,
    grantedScope: entry.scope,
    log: deps.log,
    signal,
  });
  // Race the handler against the deadline: the signal above is only advisory
  // (a handler that ignores it would otherwise tie up an async slot forever),
  // so force-reject at the deadline instead of relying on cooperation.
  // Promise.race attaches a reaction to `dispatched`, so a later rejection from
  // an uncooperative handler is consumed rather than left unhandled.
  const result = await Promise.race([
    dispatched,
    rejectOnAbort(signal, () => errors.timeout({ operation: 'grant.request', timeoutMs })),
  ]);
  return { result };
}

/** A promise that rejects (never resolves) the moment `signal` aborts. */
function rejectOnAbort(signal: AbortSignal, makeError: () => Error): Promise<never> {
  return new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(makeError());
      return;
    }
    signal.addEventListener('abort', () => reject(makeError()), { once: true });
  });
}
