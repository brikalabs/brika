// Build-time: block view module compiler replaces these with globalThis.__brika.blockHooks

/**
 * Hooks for client-rendered block views.
 *
 * A block view is a React component (`src/blocks/<id>.view.tsx`) that a plugin
 * ships to fully own a block's configuration UI inside the workflow editor.
 * The host populates `globalThis.__brika.blockHooks` before any view loads, and
 * the compiler rewrites this module to that bridge, so these stubs only run if a
 * view is (incorrectly) executed outside the host renderer.
 *
 * The host UI is same-origin, so a view can also `fetch()` any hub API
 * (e.g. `/api/sparks`), use the bridged react-query, and render any Clay
 * component. That is the generic primitive: dynamic selects, live previews and
 * cross-plugin pickers are plugin code, with zero host hardcoding.
 */

/**
 * Read the current configuration object for this block instance.
 *
 * Re-renders whenever the config changes (including the writes you make through
 * {@link useUpdateBlockConfig}).
 */
export function useBlockConfig<T = Record<string, unknown>>(): T {
  throw new Error('useBlockConfig() is only available in client-rendered block views');
}

/**
 * Returns a stable callback that merges a partial patch into this block's
 * configuration. Pass a single field or several at once; omitted keys are kept.
 */
export function useUpdateBlockConfig(): (patch: Record<string, unknown>) => void {
  throw new Error('useUpdateBlockConfig() is only available in client-rendered block views');
}

/** The workflow-local instance id of this block (e.g. "spark-receiver-1"). */
export function useBlockId(): string {
  throw new Error('useBlockId() is only available in client-rendered block views');
}

/** The fully-qualified block type (e.g. "@brika/blocks-builtin:spark-receiver"). */
export function useBlockType(): string {
  throw new Error('useBlockType() is only available in client-rendered block views');
}

/**
 * The block's latest emitted value, streamed live from the running workflow.
 * A node-body view uses this to render live previews (e.g. a countdown ring).
 * Returns undefined until the block emits, and for blocks that are not running.
 * For richer or plugin-owned data, call a plugin action via useAction instead.
 */
export function useBlockData<T>(): T | undefined {
  throw new Error('useBlockData() is only available in client-rendered block views');
}

/**
 * A variable available to this block, derived from the resolved types of the
 * events flowing into it. Use these to build typed autocompletion: e.g. an
 * upstream spark payload of `{ trackName: string }` surfaces as a variable
 * `inputs.in.trackName` of type `string`.
 */
export interface BlockVariable {
  /** Reference name, e.g. `inputs.in.trackName`. */
  name: string;
  /** Where it comes from (upstream block id/port or config). */
  source: string;
  /** Resolved type name, e.g. `string`, `number`, `{ ... }`. */
  type: string;
}

/**
 * The typed variables available to this block, collected from upstream event
 * types. Drives field autocompletion inside a block's config view. Empty on the
 * node-body surface.
 */
export function useBlockVariables(): BlockVariable[] {
  throw new Error('useBlockVariables() is only available in client-rendered block views');
}
