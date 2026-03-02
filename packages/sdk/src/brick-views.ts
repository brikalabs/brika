// Build-time: brick module compiler replaces with globalThis.__brika.brickHooks

/**
 * Subscribe to data pushed from the plugin process via setBrickData().
 * Returns undefined until data arrives.
 */
export function useBrickData<T>(): T | undefined {
  throw new Error('useBrickData() is only available in client-rendered bricks');
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
