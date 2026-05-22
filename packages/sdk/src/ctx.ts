/**
 * Typed grant context.
 *
 * `ctx` is the single object a plugin uses to call every host-mediated
 * operation. Each grant module (e.g. `@brika/sdk/grants/net`) augments
 * the `Ctx` interface via TypeScript module augmentation, so plugins
 * get full type-checking without codegen.
 *
 * At runtime, `ctx` is a Proxy that:
 *   1. Reads `globalThis.__brika_grants` — the frozen, branded vector
 *      the prelude injects before plugin code runs.
 *   2. On a call site `ctx.foo.bar(args)`, accumulates the dotted path
 *      (`foo.bar`) and checks the vector before issuing IPC.
 *   3. If the grant id is NOT in the vector, throws
 *      `PermissionDeniedError` at the SDK boundary — no IPC round-trip
 *      on denied calls.
 *   4. Otherwise calls the `grant.request` RPC and unwraps the result.
 *
 * The vector is read once at `buildCtx()` time; the prelude exports a
 * future hot-update path that will let the hub push a new vector (e.g.
 * after operator revocation) and rebuild `ctx` against it.
 */

import { BrikaError } from '@brika/errors';
import type { GrantId, GrantVector } from '@brika/grants';
import type { Channel } from '@brika/ipc';
import { getGrantVector, grantRequest } from '@brika/ipc/contract';
import { PRELUDE_BRAND } from './bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Ctx interface (open for module augmentation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marker base for the root grant namespace. Grant modules augment the `Ctx`
 * interface so plugins see typed methods at `ctx.foo.bar`.
 *
 * @example
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

// ─────────────────────────────────────────────────────────────────────────────
// Build ctx from a vector + channel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a `Ctx` from a grant vector + an IPC channel.
 *
 * The returned object is a Proxy. Property access walks a path-accumulating
 * Proxy tree until the path is invoked, at which point the SDK does the
 * vector lookup and IPC call.
 */
export function buildCtx(vector: GrantVector, channel: Channel): Ctx {
  // Path -> id lookup. Plugin code writes `ctx.net.fetch(args)` which the
  // Proxy joins to the path "net.fetch"; the vector tells us that path
  // corresponds to the reverse-DNS id `dev.brika.net.fetch` that travels
  // over the wire.
  const pathToId = new Map<string, GrantId>();
  for (const grant of vector.grants) {
    pathToId.set(grant.ctxPath, grant.id);
  }
  return createCtxProxy([], pathToId, channel);
}

function createCtxProxy(
  pathSegments: ReadonlyArray<string>,
  pathToId: ReadonlyMap<string, GrantId>,
  channel: Channel
): Ctx {
  // The Proxy target is a function so the handler can intercept both `get`
  // (path traversal) and `apply` (grant invocation). Ctx is an open
  // interface augmented by grant modules with method signatures the Proxy
  // responds to via path traversal — tsc requires the `unknown` bridge to
  // widen the callable Proxy to the augmented Ctx shape.
  const noop = (..._args: unknown[]): unknown => undefined;
  const proxy = new Proxy(noop, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') {
        // Avoid Promise/iterator probes — returning undefined here is safe
        // because nothing legitimately reads symbols off `ctx`.
        return undefined;
      }
      return createCtxProxy([...pathSegments, prop], pathToId, channel);
    },
    apply(_target, _thisArg, args: unknown[]) {
      const path = pathSegments.join('.');
      if (path === '') {
        // Synchronous error: ctx itself is not callable. This is a typing
        // bug, not a runtime denial — let it propagate.
        throw new TypeError('ctx is not callable — use ctx.<grant>(args)');
      }
      const id = pathToId.get(path);
      if (id === undefined) {
        // Grant denial is async-shaped: the caller used `await`, so a
        // rejected promise is what they expect (matches what a
        // channel.call rejection would have looked like).
        return Promise.reject(
          new BrikaError(
            'PERMISSION_DENIED',
            `Grant at "ctx.${path}" is not in this plugin's vector. Declare it in the manifest's "grants" map and ensure the operator has permitted it.`,
            { data: { grant: path } }
          )
        );
      }
      // Plugin calls pass exactly one args object; anything else is a
      // typing error the augmented interface would have caught.
      const payload = args.length === 0 ? {} : args[0];
      return channel.call(grantRequest, { id, args: payload }).then((res) => res.result);
    },
  }) as unknown;
  return proxy as Ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prelude injection point
// ─────────────────────────────────────────────────────────────────────────────

const GRANTS_BRAND = Symbol.for('brika.grants.brand');

interface InjectedVector extends GrantVector {
  readonly [GRANTS_BRAND]: true;
}

interface GrantsGlobal {
  __brika_grants?: InjectedVector;
}

export { GRANTS_BRAND };

/**
 * Read the grant vector injected by the prelude. Throws with a clear
 * message if the SDK is being used outside a plugin process (e.g. during
 * unit tests that didn't install the testing stub).
 */
export function readInjectedVector(): GrantVector {
  const g = globalThis as unknown as GrantsGlobal;
  const vector = g.__brika_grants;
  if (vector?.[GRANTS_BRAND] !== true) {
    throw new Error(
      'Brika grant vector is not installed yet. This typically means a ctx.* call ran at module-load time (before the hub finished startup). Move the call into onInit() or a later handler — the vector is guaranteed to be available there.'
    );
  }
  return vector;
}

/**
 * Install a vector as `globalThis.__brika_grants`. Called by the prelude
 * at plugin spawn time; not part of the plugin-facing public API.
 *
 * The installed object is frozen and branded — plugin code cannot rebind
 * the global to a more permissive vector once installed.
 */
export function installVector(vector: GrantVector): void {
  if (!vector || typeof vector !== 'object' || !Array.isArray(vector.grants)) {
    throw new TypeError(
      `installVector: expected { grants: GrantEntry[] }, got ${typeof vector === 'object' ? JSON.stringify(vector) : typeof vector}`
    );
  }
  const g = globalThis as unknown as GrantsGlobal;
  if (g.__brika_grants !== undefined) {
    throw new Error('Grant vector already installed — refusing to overwrite.');
  }
  const branded: InjectedVector = Object.freeze({
    ...vector,
    grants: Object.freeze([...vector.grants]),
    [GRANTS_BRAND]: true as const,
  });
  Object.defineProperty(g, '__brika_grants', {
    value: branded,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

/**
 * RPC the prelude uses to fetch the vector from the hub at startup. Re-
 * exported here so consumers don't need to import the contract module
 * directly.
 */
export { getGrantVector, grantRequest } from '@brika/ipc/contract';

// ─────────────────────────────────────────────────────────────────────────────
// Plugin-facing singleton
// ─────────────────────────────────────────────────────────────────────────────

/** Lazily-built singleton `ctx` the plugin imports as `import { ctx } from '@brika/sdk'`. */
let cachedCtx: Ctx | undefined;

function buildCtxFromInjection(): Ctx {
  const bridge = globalThis.__brika_ipc;
  if (!bridge || !(PRELUDE_BRAND in bridge)) {
    throw new Error(
      'ctx is unavailable: the Brika prelude has not been loaded. Plugin code must run inside a process spawned by the Brika hub.'
    );
  }
  const vector = readInjectedVector();
  return buildCtx(vector, bridge.channel);
}

/**
 * The plugin-facing grant surface.
 *
 * Lazily constructs on first property access. The vector must already be
 * installed (the prelude does this at startup before any plugin code runs),
 * so `ctx.foo.bar(...)` is safe from `onInit`, event handlers, route
 * handlers — anywhere that runs after the plugin process is ready.
 *
 * Module-load-time access (top-level `await ctx.foo.bar()`) is NOT
 * supported because the vector hasn't been fetched yet; call from
 * `onInit` or later instead.
 */
const ctxRoot: Ctx = {} as Ctx;

export const ctx: Ctx = new Proxy(ctxRoot, {
  get(_target, prop) {
    cachedCtx ??= buildCtxFromInjection();
    return Reflect.get(cachedCtx, prop);
  },
});
