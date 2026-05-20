/**
 * Typed capability context.
 *
 * `ctx` is the single object a plugin uses to call every host capability.
 * Each capability file (e.g. `@brika/capabilities/net`) augments the `Ctx`
 * interface via TypeScript module augmentation, so plugins get full
 * type-checking without codegen.
 *
 * At runtime, `ctx` is a Proxy that:
 *   1. Reads `globalThis.__brika_caps` — the frozen, branded vector the
 *      prelude injects before plugin code runs.
 *   2. On call site `ctx.foo.bar(args)`, accumulates the dotted path
 *      (`foo.bar`) and checks the vector before issuing IPC.
 *   3. If the capability id is NOT in the vector, throws
 *      `PermissionDeniedError` at the SDK boundary — no IPC round-trip on
 *      denied calls.
 *   4. Otherwise calls the `capability.request` RPC and unwraps the result.
 *
 * The vector is read once at `buildCtx()` time; if the prelude ever updates
 * the global (e.g. hot permission revocation in T2), call `buildCtx` again.
 */

import type { CapabilityId, CapabilityVector } from '@brika/capabilities';
import type { Channel } from '@brika/ipc';
import { capabilityRequest } from '@brika/ipc/contract';
import { PermissionDeniedError } from './errors';

/**
 * Marker base for the root capability namespace. Capability packages augment
 * the `Ctx` interface so plugins see typed methods at `ctx.foo.bar`.
 *
 * Example augmentation:
 * ```ts
 * declare module '@brika/sdk' {
 *   interface Ctx {
 *     net: {
 *       fetch(args: { url: string }): Promise<{ status: number; body: string }>;
 *     };
 *   }
 * }
 * ```
 */
type CtxBase = Record<never, never>;

export interface Ctx extends CtxBase {}

/**
 * Build a `Ctx` from a capability vector + an IPC channel.
 *
 * The returned object is a Proxy. Property access walks a path-accumulating
 * Proxy tree until the path is invoked, at which point the SDK does the
 * vector lookup and IPC call.
 */
export function buildCtx(vector: CapabilityVector, channel: Channel): Ctx {
  // Path -> id lookup. Plugin code writes `ctx.net.fetch(args)` which the
  // Proxy joins to the path "net.fetch"; the vector tells us that path
  // corresponds to the reverse-DNS id `dev.brika.net.fetch` that travels
  // over the wire.
  const pathToId = new Map<string, CapabilityId>();
  for (const grant of vector.grants) {
    pathToId.set(grant.ctxPath, grant.id);
  }
  return createCtxProxy([], pathToId, channel);
}

function createCtxProxy(
  pathSegments: ReadonlyArray<string>,
  pathToId: ReadonlyMap<string, CapabilityId>,
  channel: Channel
): Ctx {
  // The Proxy target is a function so the handler can intercept both `get`
  // (path traversal) and `apply` (capability invocation). Ctx is an open
  // interface augmented by capability files with method signatures the
  // Proxy responds to via path traversal — tsc requires the unknown
  // bridge to widen the callable Proxy to the augmented Ctx shape.
  const noop = (..._args: unknown[]): unknown => undefined;
  const proxy = new Proxy(noop, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') {
        // Avoid the Promise/iterator probe — returning undefined here is
        // safe because nothing legitimately reads symbols off `ctx`.
        return undefined;
      }
      return createCtxProxy([...pathSegments, prop], pathToId, channel);
    },
    apply(_target, _thisArg, args: unknown[]) {
      const path = pathSegments.join('.');
      if (path === '') {
        // Synchronous error: ctx itself is not callable. This is a typing
        // bug, not a runtime denial — let it propagate.
        throw new TypeError('ctx is not callable — use ctx.<capability>(args)');
      }
      const id = pathToId.get(path);
      if (id === undefined) {
        // Capability denial is async-shaped: the caller used `await`, so a
        // rejected promise is what they expect (matches what a channel.call
        // rejection would have looked like).
        return Promise.reject(
          new PermissionDeniedError(
            `Capability at "ctx.${path}" is not in this plugin's grant vector. Declare it in the manifest's "capabilities" map and ensure the user has granted it.`,
            path
          )
        );
      }
      // Plugin calls pass exactly one args object; everything else is a
      // typing error and would have been caught by the augmented interface.
      const payload = args.length === 0 ? {} : args[0];
      return channel
        .call(capabilityRequest, { id, args: payload as never })
        .then((res) => res.result);
    },
  });
  return proxy as unknown as Ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prelude injection point
// ─────────────────────────────────────────────────────────────────────────────

const CAPS_BRAND = Symbol.for('brika.caps.brand');

interface InjectedVector extends CapabilityVector {
  readonly [CAPS_BRAND]: true;
}

interface CapsGlobal {
  __brika_caps?: InjectedVector;
}

/**
 * Read the capability vector injected by the prelude. Throws with a clear
 * message if the SDK is being used outside a plugin process (e.g. during
 * unit tests that didn't install the testing stub).
 */
export function readInjectedVector(): CapabilityVector {
  const g = globalThis as CapsGlobal;
  const vector = g.__brika_caps;
  if (vector?.[CAPS_BRAND] !== true) {
    throw new Error(
      'globalThis.__brika_caps is missing or not branded. The Brika prelude must inject the vector before plugin code runs.'
    );
  }
  return vector;
}

/**
 * Install a vector as `globalThis.__brika_caps`. Called by the prelude at
 * plugin spawn time; not part of the plugin-facing public API.
 *
 * The installed object is frozen and branded — plugin code cannot rebind
 * the global to a more permissive vector once installed.
 */
export function installVector(vector: CapabilityVector): void {
  const g = globalThis as CapsGlobal;
  if (g.__brika_caps !== undefined) {
    throw new Error('Capability vector already installed — refusing to overwrite.');
  }
  const branded: InjectedVector = Object.freeze({
    ...vector,
    grants: Object.freeze([...vector.grants]),
    [CAPS_BRAND]: true as const,
  });
  Object.defineProperty(g, '__brika_caps', {
    value: branded,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

export { CAPS_BRAND };

// ─────────────────────────────────────────────────────────────────────────────
// Plugin-facing singleton
// ─────────────────────────────────────────────────────────────────────────────

import { PRELUDE_BRAND } from './bridge';

interface PreludeWithChannel {
  channel: Channel;
}

/** Lazily-built singleton `ctx` the plugin imports as `import { ctx } from '@brika/sdk'`. */
let cachedCtx: Ctx | undefined;

function buildCtxFromInjection(): Ctx {
  const bridge = globalThis.__brika_ipc;
  if (!bridge || !(PRELUDE_BRAND in bridge)) {
    throw new Error(
      'ctx is unavailable: the Brika prelude has not been loaded. Plugin code must run inside a process spawned by the BRIKA hub.'
    );
  }
  const channel = (bridge as unknown as PreludeWithChannel).channel;
  const vector = readInjectedVector();
  return buildCtx(vector, channel);
}

/**
 * The plugin-facing capability surface.
 *
 * Lazily constructs on first property access. The vector must already be
 * installed (the prelude does this at startup before any plugin code runs),
 * so `ctx.foo.bar(...)` is safe from `onInit`, event handlers, route
 * handlers — anywhere that runs after the plugin process is ready.
 *
 * Module-load-time access (top-level `await ctx.foo.bar()`) is NOT
 * supported because the vector hasn't been fetched yet; call from `onInit`
 * or later instead.
 */
const ctxRoot: Ctx = {} as Ctx;

export const ctx: Ctx = new Proxy(ctxRoot, {
  get(_target, prop) {
    cachedCtx ??= buildCtxFromInjection();
    return Reflect.get(cachedCtx, prop);
  },
});
