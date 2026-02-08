/**
 * Internal hook state management for brick components.
 */

import { _setActionRegistrar, type ActionHandler } from '@brika/ui-kit';

export interface BrickState {
  hooks: unknown[];
  effects: Array<{ cleanup?: (() => void) | void; deps?: unknown[] }>;
  actionRefs: Map<string, { current: ActionHandler }>;
  brickSize: { width: number; height: number };
  config: Record<string, unknown>;
  configKeys: Set<string> | null;
  scheduleRender: () => void;
}

let current: BrickState | null = null;
let hookIdx = 0;
let autoActionIdx = 0;

/** @internal — called by brick runtime before each render */
export function _beginRender(state: BrickState) {
  current = state;
  hookIdx = 0;
  autoActionIdx = 0;

  // Clear auto-registered actions from previous render
  for (const key of state.actionRefs.keys()) {
    if (key.startsWith('__a')) state.actionRefs.delete(key);
  }

  // Install the action registrar so builder functions can auto-register handlers
  _setActionRegistrar((handler: ActionHandler) => {
    const id = `__a${autoActionIdx++}`;
    const existing = state.actionRefs.get(id);
    if (existing) {
      existing.current = handler;
    } else {
      state.actionRefs.set(id, { current: handler });
    }
    return id;
  });
}

/** @internal — called by brick runtime after each render */
export function _endRender() {
  current = null;
  _setActionRegistrar(null);
}

/** @internal — run pending effects after render */
export function _flushEffects(_state: BrickState) {
  // Effects are processed during the hooks themselves (deferred via queueMicrotask)
}

/** @internal — cleanup all effects on unmount */
export function _cleanupEffects(state: BrickState) {
  for (const effect of state.effects) {
    if (effect && typeof effect.cleanup === 'function') effect.cleanup();
  }
  state.effects.length = 0;
}

/** @internal — create a fresh BrickState with microtask-batched renders */
export function _createState(scheduleRender: () => void): BrickState {
  let pending = false;
  return {
    hooks: [],
    effects: [],
    actionRefs: new Map(),
    brickSize: { width: 2, height: 2 },
    config: {},
    configKeys: null,
    scheduleRender() {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        scheduleRender();
      });
    },
  };
}

export function getState(): BrickState {
  if (!current) throw new Error('Hooks can only be called inside a brick component');
  return current;
}

export function nextHookIdx(): number {
  return hookIdx++;
}

export function depsChanged(prev?: unknown[], next?: unknown[]): boolean {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  return prev.some((v, i) => !Object.is(v, next[i]));
}
