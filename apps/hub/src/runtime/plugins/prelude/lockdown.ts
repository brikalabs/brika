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
 */
const SCRUBBED_GLOBALS = [
  'fetch',
  'WebSocket',
  'EventSource',
  'XMLHttpRequest',
  'BroadcastChannel',
  'Request',
  'Response',
] as const;

/**
 * Bun namespace members that bypass the grant registry. `Bun.spawn` is
 * the obvious one; `Bun.write` / `Bun.file` give direct filesystem
 * access; the server/socket APIs let a plugin open its own ports.
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
  'dns',
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrity gate
// ─────────────────────────────────────────────────────────────────────────────

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
  for (const [key, snap] of globalScrubSnapshot) {
    if (g[key] !== snap) {
      drift.push(`globalThis.${key}`);
    }
  }
  const bunNs = (globalThis as unknown as { Bun?: MutableTarget }).Bun;
  if (bunNs) {
    for (const [key, snap] of bunScrubSnapshot) {
      if (bunNs[key] !== snap) {
        drift.push(`Bun.${key}`);
      }
    }
  }
  return drift.length === 0 ? null : drift;
}

// Re-export GRANTS_BRAND for downstream introspection.
export { GRANTS_BRAND } from '@brika/sdk/ctx';
