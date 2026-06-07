// Build-time: brick module compiler replaces with globalThis.__brika.brickHooks

import type { z } from 'zod';
import { setBrickData } from './api/push-brick-data';

/**
 * Subscribe to data pushed from the plugin process.
 *
 * @internal The author-facing API is {@link defineBrick}'s typed
 *   `descriptor.data.use()`, which is built on this hook. This bridged primitive
 *   stays exported because the compiler rewrites it to the host hook in the browser.
 * @returns The latest pushed data, or undefined until the first push.
 */
export function useBrickData<T>(): T | undefined {
  throw new Error('useBrickData() is only available in client-rendered bricks');
}

/**
 * A typed data channel between a brick's plugin-process producer and its
 * client-rendered view, declared once so the id and payload type are shared:
 *
 * ```ts
 * // brick-data.ts (imported by both sides)
 * export const player = defineBrickData<PlayerState>('player');
 *
 * // index.tsx (plugin process)   player.set({ track: '…' });
 * // player.tsx (client view)     const state = player.use();
 * ```
 *
 * `set` only runs in the plugin process; `use` only runs in a client view.
 * Each side calls its own method, so the other being unavailable in that
 * environment is never reached.
 */
export interface BrickDataChannel<T> {
  readonly id: string;
  /** Plugin-process side: push new data to every instance of this brick. */
  set(data: T): void;
  /** Client view side (React hook): latest pushed data, undefined until first push. */
  use(): T | undefined;
}

/**
 * Declare a typed brick-data channel by string id.
 *
 * @internal The author-facing API is {@link defineBrick}, which declares id,
 *   meta, config, and a zod `data` schema once, validates the payload before it
 *   crosses IPC, and shares the id with the manifest so they cannot drift.
 *   `defineBrick`'s `data` channel is built on this function.
 *
 * @param id The brick id this channel pushes to.
 * @returns A channel whose `set` runs in the plugin process and `use` in the view.
 * @see {@link defineBrick}
 */
export function defineBrickData<T>(id: string): BrickDataChannel<T> {
  return {
    id,
    set: (data: T) => setBrickData(id, data),
    use: () => useBrickData<T>(),
  };
}

/**
 * Read the per-instance config for this brick.
 *
 * Pass the brick's own zod `config` schema to get a typed, defaulted, validated
 * object back (the host parses the raw config through it), so the view reads the
 * exact same schema it declares for the manifest. Call with no argument for the
 * untyped `Record<string, unknown>` (kept for back-compat).
 *
 * ```ts
 * export const config = z.object({ refreshInterval: z.number().default(5000) });
 * const { refreshInterval } = useBrickConfig(config); // number, default applied
 * ```
 */
export function useBrickConfig(): Record<string, unknown>;
export function useBrickConfig<S extends z.ZodType>(schema: S): z.infer<S>;
export function useBrickConfig(_schema?: z.ZodType): unknown {
  throw new Error('useBrickConfig() is only available in client-rendered bricks');
}

/**
 * Read the current grid size of this brick instance.
 */
export function useBrickSize(): { width: number; height: number } {
  throw new Error('useBrickSize() is only available in client-rendered bricks');
}

/**
 * Returns a stable callback to send an action to the current brick instance.
 * Reads instanceId from BrickViewContext (safe across concurrent bricks).
 */
export function useCallBrickAction(): (actionId: string, payload?: unknown) => Promise<void> {
  throw new Error('useCallBrickAction() is only available in client-rendered bricks');
}
