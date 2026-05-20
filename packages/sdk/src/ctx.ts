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
  const grantedIds = new Set(vector.grants.map((g) => g.id));
  return createCtxProxy([], grantedIds, channel);
}

function createCtxProxy(
  pathSegments: ReadonlyArray<string>,
  grantedIds: ReadonlySet<CapabilityId>,
  channel: Channel
): Ctx {
  // The Proxy target is a function so the handler can intercept both `get`
  // (path traversal) and `apply` (capability invocation).
  const noop = (): void => {};
  return new Proxy(noop, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') {
        // Avoid the Promise/iterator probe — returning undefined here is
        // safe because nothing legitimately reads symbols off `ctx`.
        return undefined;
      }
      return createCtxProxy([...pathSegments, prop], grantedIds, channel);
    },
    apply(_target, _thisArg, args: unknown[]) {
      const id = pathSegments.join('.');
      if (id === '') {
        // Synchronous error: ctx itself is not callable. This is a typing
        // bug, not a runtime denial — let it propagate.
        throw new TypeError('ctx is not callable — use ctx.<capability>(args)');
      }
      if (!grantedIds.has(id)) {
        // Capability denial is async-shaped: the caller used `await`, so a
        // rejected promise is what they expect (matches what a channel.call
        // rejection would have looked like).
        return Promise.reject(
          new PermissionDeniedError(
            `Capability "${id}" is not in this plugin's grant vector. Declare it in the manifest and ensure the user has granted it.`,
            id
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
