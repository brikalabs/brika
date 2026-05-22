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
 * Neutralizes the application-layer timing oracle a malicious plugin
 * would use to fingerprint the vector by measuring call latency.
 * Pulled to a constant so the same value is used for the delay AND
 * the runtime random clamp.
 */
export const GRANT_REQUEST_JITTER_MAX_MS = 5;

/**
 * Random 0–`GRANT_REQUEST_JITTER_MAX_MS` ms delay. Uses
 * `crypto.getRandomValues` (the cryptographically secure RNG) — not for
 * security per se, but because Math.random can be predicted enough to
 * undermine the oracle protection in pathological cases.
 */
export function jitterDelay(): Promise<void> {
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
  const watchdog = AbortSignal.timeout(opts.timeoutMs ?? GRANT_REQUEST_TIMEOUT_MS);
  const signal = AbortSignal.any([deps.lifetimeSignal, watchdog]);
  const result = await deps.registry.dispatch(call.id, call.args, {
    pluginUid: deps.pluginUid,
    pluginRoot: deps.pluginRoot,
    grantedScope: entry.scope,
    log: deps.log,
    signal,
  });
  return { result };
}
