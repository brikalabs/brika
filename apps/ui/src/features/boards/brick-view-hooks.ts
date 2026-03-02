/**
 * Hooks for client-rendered bricks.
 * Exposed to browser-compiled brick modules via globalThis.__brika.brickHooks.
 */

import { useCallback, useContext } from 'react';
import { brickInstancesApi } from './api';
import { BrickViewContext, type BrickViewContextValue } from './components/BrickViewContext';
import { useBoardStore } from './store';

function useRequiredContext(): BrickViewContextValue {
  const ctx = useContext(BrickViewContext);
  if (!ctx) {
    throw new Error('Brick hook called outside a client-rendered brick');
  }
  return ctx;
}

/**
 * Subscribe to data pushed from the plugin process via setBrickData().
 * Returns undefined until data arrives.
 */
export function useBrickData<T>(): T | undefined {
  const { brickTypeId } = useRequiredContext();
  return useBoardStore((s) => s.brickData.get(brickTypeId)) as T | undefined;
}

/**
 * Read the per-instance config for this brick.
 */
export function useBrickConfig(): Record<string, unknown> {
  return useRequiredContext().config;
}

/**
 * Read the current grid size of this brick instance.
 */
export function useBrickSize(): { width: number; height: number } {
  const { size } = useRequiredContext();
  return { width: size.w, height: size.h };
}

/**
 * Returns a stable callback to send an action to the current brick instance.
 * Reads instanceId from BrickViewContext — safe across concurrent bricks.
 */
export function useCallBrickAction() {
  const { instanceId } = useRequiredContext();
  return useCallback(
    (actionId: string, payload?: unknown) =>
      brickInstancesApi.action(instanceId, actionId, payload),
    [instanceId]
  );
}
