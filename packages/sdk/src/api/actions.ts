/**
 * Plugin Actions API
 *
 * Define server-side actions that plugin pages can call transparently.
 * The module compiler transforms action imports into lightweight refs
 * at build time — no manual endpoint registration needed.
 *
 * @example
 * ```ts
 * // actions.ts (plugin process)
 * import { defineAction } from '@brika/sdk';
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
 * import { useAction, callAction } from '@brika/sdk/ui-kit/hooks';
 * import { getDevices, scan } from '../actions';
 *
 * export default function DevicesPage() {
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
  readonly __phantom?: { input: TInput; output: TOutput };
}

// ─── Internals ───────────────────────────────────────────────────────────────

let counter = 0;

/**
 * Multiplicative hash → base36.
 * Matches the compiler's `actionId()` — both use source-order index.
 */
function actionId(index: number): string {
  return (Math.imul(index + 1, 0x9e3779b9) >>> 0).toString(36);
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Define a server-side action.
 *
 * The action ID is auto-generated from source order — the module compiler
 * produces matching IDs using the same hash on `Bun.Transpiler.scan()` exports.
 *
 * Actions files should only export `defineAction()` results.
 *
 * @example
 * ```ts
 * export const getDevices = defineAction(async () => { ... });
 * ```
 */
export function defineAction<TInput = void, TOutput = unknown>(
  handler: (input: TInput) => TOutput | Promise<TOutput>
): ActionRef<TInput, TOutput> {
  const id = actionId(counter++);
  getContext().registerAction(id, handler as (input?: unknown) => unknown);
  return { __actionId: id } as ActionRef<TInput, TOutput>;
}
