/**
 * Plugin Actions API
 *
 * Define server-side actions that plugin pages and bricks can call.
 * Action IDs are auto-generated at build time from `hash(filePath:exportName)`
 * — deterministic, order-independent, and collision-resistant.
 *
 * The build system injects IDs automatically. Developers never type or see the ID.
 *
 * @example
 * ```ts
 * // actions.ts (plugin process)
 * import { defineAction } from '@brika/sdk/actions';
 *
 * export const getDevices = defineAction(async () => {
 *   return controller.getDevices();
 * });
 *
 * export const scan = defineAction(async () => {
 *   return controller.discover();
 * });
 * ```
 *
 * ```tsx
 * // pages/devices.tsx (browser — compiled by Bun.build)
 * import { useAction, useCallAction } from '@brika/sdk/ui-kit/hooks';
 * import { getDevices, scan } from '../actions';
 *
 * export default function DevicesPage() {
 *   const callAction = useCallAction();
 *   const { data, loading, refetch } = useAction(getDevices);
 *   return <button onClick={() => callAction(scan).then(refetch)}>Scan</button>;
 * }
 * ```
 */

import { getContext } from '../context';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Opaque reference to a server-side action.
 *
 * At runtime this is just `{ __actionId: string }`.
 * The phantom type carries input/output types for compile-time safety.
 */
export interface ActionRef<TInput = void, TOutput = unknown> {
  readonly __actionId: string;
  /** @internal phantom field — never set at runtime */
  readonly __phantom?: {
    input: TInput;
    output: TOutput;
  };
}

// ─── Internal tracking for deferred action refs ──────────────────────────────

type ActionHandler<TInput, TOutput> = (input: TInput) => TOutput | Promise<TOutput>;

const pendingHandlers = new WeakMap<object, (input?: unknown) => unknown>();

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Define a server-side action.
 *
 * The build system auto-injects the action ID via `__finalizeActions` at
 * module evaluation time. The developer just writes `defineAction(handler)`.
 *
 * @example
 * ```ts
 * export const getDevices = defineAction(async () => { ... });
 * ```
 */
export function defineAction<TInput = void, TOutput = unknown>(
  handlerOrId: string | ActionHandler<TInput, TOutput>,
  handler?: ActionHandler<TInput, TOutput>,
): ActionRef<TInput, TOutput> {
  if (typeof handlerOrId === 'string') {
    // Explicit ID — injected by build system or used in tests
    const id = handlerOrId;
    if (typeof handler !== 'function') {
      throw new TypeError(`defineAction('${id}') requires a handler function as the second argument`);
    }
    getContext().registerAction(id, handler as (input?: unknown) => unknown);
    return { __actionId: id } as ActionRef<TInput, TOutput>;
  }

  // Deferred: create ref now, finalization assigns the ID later
  const ref = { __actionId: '' } as ActionRef<TInput, TOutput>;
  pendingHandlers.set(ref, handlerOrId as (input?: unknown) => unknown);
  return ref;
}

// ─── Build-time finalization ─────────────────────────────────────────────────

/**
 * Finalize deferred action refs by assigning precomputed IDs and registering handlers.
 *
 * Called automatically by the server build plugin at the end of each action module.
 * NOT part of the public API — the `__` prefix signals internal use.
 *
 * @param ids - Map of `{ exportName: precomputedActionId }` from the build plugin
 * @param exports - Object of `{ exportName: actionRef }` from the module
 */
export function __finalizeActions(ids: Record<string, string>, exports: Record<string, unknown>): void {
  for (const [name, ref] of Object.entries(exports)) {
    if (!ref || typeof ref !== 'object') continue;
    const handler = pendingHandlers.get(ref);
    if (!handler) continue;

    const id = ids[name];
    if (!id) continue;
    (ref as { __actionId: string }).__actionId = id;
    getContext().registerAction(id, handler);
    pendingHandlers.delete(ref);
  }
}
