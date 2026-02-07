import type { BrickActionHandler } from '@brika/ui-kit';
import { getState } from './state';
import { useRef } from './use-ref';

/**
 * Register an action handler for user interactions (toggles, sliders, buttons).
 * The handler always has access to the latest state via ref pattern.
 * Brick auto-re-renders after the handler runs.
 */
export function useAction(actionId: string, handler: BrickActionHandler): void {
  const state = getState();
  const ref = useRef(handler);
  ref.current = handler; // always keep latest

  if (!state.actionRefs.has(actionId)) {
    state.actionRefs.set(actionId, ref);
  }
}
