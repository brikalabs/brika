// Build-time: brick module compiler replaces with globalThis.__brika.brickHooks

import { setBrickData } from './api/push-brick-data';

/**
 * Subscribe to data pushed from the plugin process via setBrickData().
 * Returns undefined until data arrives.
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
 * Declare a typed brick-data channel. Replaces the stringly-typed
 * `setBrickData('id', …)` / `useBrickData<T>()` pair with one binding that
 * shares the id and payload type across the process boundary.
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
 */
export function useBrickConfig(): Record<string, unknown> {
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
 * Reads instanceId from BrickViewContext — safe across concurrent bricks.
 */
export function useCallBrickAction(): (actionId: string, payload?: unknown) => Promise<void> {
  throw new Error('useCallBrickAction() is only available in client-rendered bricks');
}
