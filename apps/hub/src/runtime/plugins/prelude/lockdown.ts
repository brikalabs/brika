/**
 * Plugin realm lockdown — runs FIRST in the prelude, before any other
 * code or import body executes inside the plugin process.
 *
 * Closes the largest hole in the plugin sandbox: a malicious plugin can
 * no longer reach ambient I/O (fetch, Bun.spawn, node:fs, bun:ffi, …)
 * directly. All hub-mediated I/O must flow through the grant vector.
 *
 * MODES (`BRIKA_LOCKDOWN_MODE`):
 *   - "enforce" (default): scrubbed globals throw; denied module imports
 *     reject at resolution. Production stance.
 *   - "warn": scrubs LOG when invoked and delegate to the real impl;
 *     denied imports LOG and still load. Migration window only.
 *   - "off": no scrubbing. Emergency escape hatch for incident response;
 *     never run prod with this.
 *
 * CRITICAL ORDERING: this file MUST be the first import in
 * `prelude/index.ts`. Top-level body code in any module imported BEFORE
 * lockdown runs against unscrubbed globals — so anything that captures
 * `Bun.spawn` or `fetch` at module-load gets the real implementation.
 * The prelude itself avoids node:/bun: imports that would trigger this.
 *
 * The vector write-key is a per-process closure-private `Symbol()` (not
 * `Symbol.for`, which would be forgeable). Only `installVectorV2(vec,
 * writeKey)` can mutate `globalThis.__brika_grants`; plugin code cannot
 * reach the symbol since it never leaves this module's closure.
 */

import { BrikaError } from '@brika/errors';
import type { GrantVector } from '@brika/grants';
import { installVector as installVectorRaw } from '@brika/sdk/ctx';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Mode
// ─────────────────────────────────────────────────────────────────────────────

const LockdownModeSchema = z.enum(['enforce', 'warn', 'off']);
export type LockdownMode = z.infer<typeof LockdownModeSchema>;

function readMode(): LockdownMode {
  const parsed = LockdownModeSchema.safeParse(process.env.BRIKA_LOCKDOWN_MODE);
  return parsed.success ? parsed.data : 'enforce';
}

const MODE: LockdownMode = readMode();

export function getLockdownMode(): LockdownMode {
  return MODE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture references the prelude itself needs after scrub
//
// Bound to `process` so callers can't accidentally call them with the
// wrong `this`. The captured refs live in module-scope closure variables;
// the only way to reach them is via the exported accessor functions.
// ─────────────────────────────────────────────────────────────────────────────

type ProcessSend = NonNullable<typeof process.send>;
type ProcessOn = typeof process.on;

const capturedSend: ProcessSend | undefined = process.send?.bind(process);
const capturedOn: ProcessOn = process.on.bind(process);

export function getSafeProcessSend(): ProcessSend {
  if (!capturedSend) {
    throw new Error('lockdown: process.send was not available when the prelude loaded');
  }
  return capturedSend;
}

export function getSafeProcessOn(): ProcessOn {
  return capturedOn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vector write-key
//
// `installVectorV2(vec, writeKey)` is the prelude's path to install the
// frozen vector. The key is a closure-private Symbol — un-forgeable from
// outside this module. The §1 plan calls for this to also gate future
// hot-update events; the SDK's lower-level `installVector` (from
// @brika/sdk/ctx) is wrapped to enforce the key check.
// ─────────────────────────────────────────────────────────────────────────────

const VECTOR_WRITE_KEY: unique symbol = Symbol('brika.grants.write-key');

export function getVectorWriteKey(): typeof VECTOR_WRITE_KEY {
  return VECTOR_WRITE_KEY;
}

export function installVectorV2(vector: GrantVector, writeKey: symbol): void {
  if (writeKey !== VECTOR_WRITE_KEY) {
    throw new BrikaError(
      'PERMISSION_DENIED',
      'installVectorV2: invalid write key — only the prelude may install the grant vector',
      { data: { permission: 'grant.vector.install' } }
    );
  }
  installVectorRaw(vector);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scrub lists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Globals that perform host I/O the plugin must not reach directly. Every
 * one of these has a hub-mediated grant equivalent (`ctx.net.fetch`, …);
 * direct access is the bypass we're closing.
 *
 * NOT INCLUDED — `Request` and `Response`: these are pure in-memory value
 * constructors. `new Request(url)` opens no connection; the network only
 * happens when the object is passed to `fetch`, which is scrubbed above.
 * Scrubbing them with an arrow stub also breaks any library that does
 * `class X extends Request {}` (e.g. `@matter/nodejs`'s
 * `NodeJsHttpRequest`), since arrow functions have no `[[Construct]]`
 * slot and ES rejects them as a superclass at class-body evaluation time.
 */
const SCRUBBED_GLOBALS = [
  'fetch',
  'WebSocket',
  'EventSource',
  'XMLHttpRequest',
  'BroadcastChannel',
] as const;

/**
 * Bun namespace members that bypass the grant registry. `Bun.spawn` is
 * the obvious one; `Bun.write` / `Bun.file` give direct filesystem
 * access; the server/socket APIs let a plugin open its own ports.
 *
 * NOT INCLUDED — `Bun.dns`: the `dns` slot itself ships with `writable:
 * false, configurable: false` on Bun ≥1.3, so neither `Reflect.set` nor
 * `defineProperty` can replace it (this used to log a `scrub-skipped`
 * warning that misleadingly suggested partial coverage). The real
 * surface — the I/O methods *on* `Bun.dns` — IS writable; see
 * `SCRUBBED_BUN_DNS_KEYS` below.
 */
const SCRUBBED_BUN_KEYS = [
  'spawn',
  'spawnSync',
  'write',
  'file',
  'serve',
  'connect',
  'listen',
  'udpSocket',
] as const;

/**
 * Methods on `process` that reach host capabilities outside the grant
 * vector. `process.kill` can signal other processes (including the hub
 * itself if PIDs are guessable); `process.dlopen` loads native modules,
 * bypassing the `bun:ffi` deny-list. The rest of `process` (cwd, env,
 * versions, …) is informational and stays available — `bun-runner`
 * already filters env to remove operator secrets before the plugin
 * subprocess starts.
 */
const SCRUBBED_PROCESS_KEYS = ['kill', 'dlopen'] as const;

/**
 * Methods on `Bun.dns` that issue DNS queries (network I/O) or mutate
 * resolver configuration. All ship with `writable: true` so direct
 * assignment via `Reflect.set` works. Constants (`ADDRCONFIG`, `ALL`,
 * `V4MAPPED`) are deliberately left alone — they're plain integers.
 */
const SCRUBBED_BUN_DNS_KEYS = [
  'lookup',
  'resolve',
  'resolveSrv',
  'resolveTxt',
  'resolveSoa',
  'resolveNaptr',
  'resolveMx',
  'resolveCaa',
  'resolveNs',
  'resolvePtr',
  'resolveCname',
  'resolveAny',
  'reverse',
  'lookupService',
  'prefetch',
  'getServers',
  'setServers',
  'getCacheStats',
] as const;

/**
 * Modules a plugin must never import. Anything that opens a file,
 * socket, subprocess, FFI handle, or alternate JS realm goes here.
 */
export const DENIED_NATIVE_MODULES: ReadonlySet<string> = new Set([
  'node:fs',
  'node:fs/promises',
  'node:net',
  'node:tls',
  'node:dgram',
  'node:dns',
  'node:dns/promises',
  'node:http',
  'node:https',
  'node:http2',
  'node:child_process',
  'node:cluster',
  'node:worker_threads',
  'node:vm',
  'node:inspector',
  'node:perf_hooks',
  'node:v8',
  'node:os',
  'bun:ffi',
  'bun:sqlite',
  'bun:jsc',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SECURITY_TAG = '[brika:lockdown]';

function logViolation(kind: string, name: string): void {
  // stderr — surfaces in the hub's onStderr log handler.
  console.warn(`${SECURITY_TAG} ${kind} access: ${name} (mode=${MODE})`);
}

function deny(name: string): never {
  throw new BrikaError(
    'PERMISSION_DENIED',
    `${name} is not available to plugins. Use the corresponding ctx.* grant instead.`,
    { data: { permission: name } }
  );
}

type MutableTarget = Record<string, unknown>;

function replaceMember(owner: object, ownerName: string, key: string): void {
  const violation = `${ownerName}.${key}`;
  // Read via Reflect so we don't fight TypeScript's narrow `object` type.
  // Property descriptors on the Bun namespace ship with `writable: true,
  // configurable: false` — plain assignment works, but defineProperty
  // with `configurable: true` is rejected by spec (can't widen a
  // non-configurable property). We therefore try plain assignment first
  // (handles configurable:false + writable:true), then defineProperty
  // (handles plain object members), then log if both fail.
  const original = Reflect.get(owner, key) as unknown;
  let replacement: unknown;
  if (MODE === 'warn') {
    if (typeof original !== 'function') {
      return;
    }
    const orig = original as (...a: unknown[]) => unknown;
    replacement = (...args: unknown[]) => {
      logViolation('warn', violation);
      return Reflect.apply(orig, owner, args);
    };
  } else {
    replacement = () => deny(violation);
  }
  if (tryReplace(owner, key, replacement)) {
    return;
  }
  logViolation('scrub-skipped', violation);
}

function tryReplace(owner: object, key: string, replacement: unknown): boolean {
  // Path A: Reflect.set — works when the slot is writable:true (covers
  // Bun namespace's configurable:false + writable:true descriptors).
  if (Reflect.set(owner, key, replacement) && Reflect.get(owner, key) === replacement) {
    return true;
  }
  // Path B: defineProperty — works when the slot is configurable:true
  // (covers plain-object globals like globalThis.fetch).
  try {
    Object.defineProperty(owner, key, {
      value: replacement,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return Reflect.get(owner, key) === replacement;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply the lockdown
// ─────────────────────────────────────────────────────────────────────────────

const globalScrubSnapshot = new Map<string, unknown>();
const bunScrubSnapshot = new Map<string, unknown>();
const bunDnsScrubSnapshot = new Map<string, unknown>();
const processScrubSnapshot = new Map<string, unknown>();

if (MODE !== 'off') {
  // 1. Ambient I/O globals.
  const g = globalThis as unknown as MutableTarget;
  for (const key of SCRUBBED_GLOBALS) {
    if (key in g) {
      replaceMember(g, 'globalThis', key);
    }
  }

  // 2. Bun namespace I/O.
  const bunNs = (globalThis as unknown as { Bun?: MutableTarget }).Bun;
  if (bunNs) {
    for (const key of SCRUBBED_BUN_KEYS) {
      if (key in bunNs) {
        replaceMember(bunNs, 'Bun', key);
      }
    }
  }

  // 2b. Bun.dns methods — see SCRUBBED_BUN_DNS_KEYS docstring for why
  //     we can't replace `Bun.dns` itself.
  const bunDnsNs = (bunNs as { dns?: MutableTarget } | undefined)?.dns;
  if (bunDnsNs) {
    for (const key of SCRUBBED_BUN_DNS_KEYS) {
      if (key in bunDnsNs) {
        replaceMember(bunDnsNs, 'Bun.dns', key);
      }
    }
  }

  // 2c. `process` capabilities that bypass the grant vector. Keep the rest
  //     of `process` available: `cwd`, `env` (already filtered upstream by
  //     bun-runner), `version`, `platform`, etc. are informational.
  const processNs = (globalThis as unknown as { process?: MutableTarget }).process;
  if (processNs) {
    for (const key of SCRUBBED_PROCESS_KEYS) {
      if (key in processNs) {
        replaceMember(processNs, 'process', key);
      }
    }
  }

  // 3. `eval` — the direct-eval entry point. We deliberately do NOT
  //    scrub `Function` (the indirect-eval constructor): in practice
  //    too many transitively-loaded libraries — including the Bun
  //    runtime's own subprocess bootstrap and `process.send` IPC
  //    serialization — touch `Function` / `Function.prototype` and
  //    replacing the global breaks the plugin process at startup. The
  //    Bun.plugin module deny-list below already cuts off the highest-
  //    value `Function`-based escape vectors (`bun:ffi`, `node:vm`).
  if (MODE === 'enforce') {
    g.eval = () => deny('eval');
  }

  // 4. Module-loader deny-list. Bun.plugin's onResolve runs for
  //    user-space module resolutions issued after the plugin is
  //    registered, so a transitive npm dep that internally imports
  //    `node:fs` via a relative path gets caught here.
  //
  //    KNOWN LIMITATION: as of Bun 1.3.13, built-in module imports
  //    (`node:fs`, `bun:ffi`, etc.) issued as bare specifiers from
  //    plugin code itself bypass the JS-level plugin system entirely
  //    — they resolve through Bun's C++ module table. There is no
  //    JS-side hook to block them at runtime. Until that changes
  //    upstream, the real defense for built-in imports is to combine
  //    this lockdown with Bun.spawn / Bun.write / Bun.file scrubs
  //    (which still block the most damaging escape vectors a plugin
  //    could reach via `await import('node:fs')`) and to ship plugins
  //    through Tier-3 WASM isolation when untrusted-marketplace
  //    plugins land. See plan §14 (residual risk).
  type BunPluginConfig = {
    name: string;
    setup: (build: {
      onResolve: (filter: { filter: RegExp }, handler: (args: { path: string }) => unknown) => void;
    }) => void;
  };
  const bunWithPlugin = (
    globalThis as unknown as { Bun?: { plugin?: (cfg: BunPluginConfig) => void } }
  ).Bun;
  if (bunWithPlugin?.plugin) {
    bunWithPlugin.plugin({
      name: 'brika-deny-native',
      setup(build) {
        build.onResolve({ filter: /^(?:node|bun):/ }, (args) => {
          if (!DENIED_NATIVE_MODULES.has(args.path)) {
            return undefined;
          }
          if (MODE === 'warn') {
            logViolation('warn-import', args.path);
            return undefined;
          }
          throw new BrikaError(
            'PERMISSION_DENIED',
            `Module "${args.path}" is denied to plugins. Use the corresponding ctx.* grant instead.`,
            { data: { permission: args.path } }
          );
        });
      },
    });
  }

  // 5. Snapshot post-scrub values so assertSealed() can detect tampering.
  for (const key of SCRUBBED_GLOBALS) {
    if (key in g) {
      globalScrubSnapshot.set(key, g[key]);
    }
  }
  if (bunNs) {
    for (const key of SCRUBBED_BUN_KEYS) {
      if (key in bunNs) {
        bunScrubSnapshot.set(key, bunNs[key]);
      }
    }
  }
  if (bunDnsNs) {
    for (const key of SCRUBBED_BUN_DNS_KEYS) {
      if (key in bunDnsNs) {
        bunDnsScrubSnapshot.set(key, bunDnsNs[key]);
      }
    }
  }
  if (processNs) {
    for (const key of SCRUBBED_PROCESS_KEYS) {
      if (key in processNs) {
        processScrubSnapshot.set(key, processNs[key]);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrity gate
// ─────────────────────────────────────────────────────────────────────────────

function collectDrift(
  owner: MutableTarget | undefined,
  ownerName: string,
  snapshot: ReadonlyMap<string, unknown>,
  drift: string[]
): void {
  if (!owner) {
    return;
  }
  for (const [key, snap] of snapshot) {
    if (owner[key] !== snap) {
      drift.push(`${ownerName}.${key}`);
    }
  }
}

/**
 * Re-check the scrubbed globals against the snapshot taken at lockdown
 * time. Returns null if intact; otherwise an array of names whose values
 * were replaced. The prelude calls this before sending `ready` — if
 * anything changed between lockdown and ready, the plugin process aborts.
 */
export function assertSealed(): ReadonlyArray<string> | null {
  if (MODE === 'off') {
    return null;
  }
  const drift: string[] = [];
  const g = globalThis as unknown as MutableTarget;
  const bunNs = (globalThis as unknown as { Bun?: MutableTarget }).Bun;
  const bunDnsNs = (bunNs as { dns?: MutableTarget } | undefined)?.dns;
  const processNs = (globalThis as unknown as { process?: MutableTarget }).process;
  collectDrift(g, 'globalThis', globalScrubSnapshot, drift);
  collectDrift(bunNs, 'Bun', bunScrubSnapshot, drift);
  collectDrift(bunDnsNs, 'Bun.dns', bunDnsScrubSnapshot, drift);
  collectDrift(processNs, 'process', processScrubSnapshot, drift);
  return drift.length === 0 ? null : drift;
}

/**
 * Replace a previously-scrubbed slot with a real, grant-mediated proxy
 * (e.g. swap the `() => deny('fetch')` stub for the actual fetch proxy
 * the prelude installs after the vector arrives).
 *
 * Mirrors the new value into the same snapshot map `assertSealed` checks,
 * so the integrity gate sees the proxy as the sealed value rather than
 * reporting drift. Callers MUST invoke this between scrub-time (lockdown
 * preload) and the integrity check (just before `ready`).
 *
 * Returns true on success, false if the slot couldn't be updated (e.g.
 * the original member wasn't snapshotted). The caller decides whether to
 * crash on failure.
 */
type ProxyOwner = 'globalThis' | 'Bun' | 'Bun.dns' | 'process';

export function swapInProxy(ownerName: ProxyOwner, key: string, replacement: unknown): boolean {
  if (MODE === 'off') {
    return false;
  }
  const target = resolveOwner(ownerName);
  if (!target) {
    return false;
  }
  if (!tryReplace(target, key, replacement)) {
    return false;
  }
  const snapshot = resolveSnapshot(ownerName);
  if (!snapshot.has(key)) {
    // The key wasn't part of the original scrub — caller used the wrong
    // owner/key. Refuse to record so a stray write doesn't poison the
    // integrity check.
    return false;
  }
  snapshot.set(key, replacement);
  return true;
}

function resolveOwner(ownerName: ProxyOwner): MutableTarget | undefined {
  const g = globalThis as unknown as MutableTarget;
  if (ownerName === 'globalThis') {
    return g;
  }
  const bunNs = (g as { Bun?: MutableTarget }).Bun;
  if (ownerName === 'Bun') {
    return bunNs;
  }
  if (ownerName === 'Bun.dns') {
    return (bunNs as { dns?: MutableTarget } | undefined)?.dns;
  }
  return (g as { process?: MutableTarget }).process;
}

function resolveSnapshot(ownerName: ProxyOwner): Map<string, unknown> {
  switch (ownerName) {
    case 'globalThis':
      return globalScrubSnapshot;
    case 'Bun':
      return bunScrubSnapshot;
    case 'Bun.dns':
      return bunDnsScrubSnapshot;
    case 'process':
      return processScrubSnapshot;
  }
}

// Re-export GRANTS_BRAND for downstream introspection.
export { GRANTS_BRAND } from '@brika/sdk/ctx';
