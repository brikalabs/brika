/**
 * Internal hook state management for brick components.
 */

import type { BrickActionHandler } from '@brika/ui-kit';

export interface BrickState {
  hooks: unknown[];
  effects: Array<{ cleanup?: (() => void) | void; deps?: unknown[] }>;
  actionRefs: Map<string, { current: BrickActionHandler }>;
  brickSize: { width: number; height: number };
  config: Record<string, unknown>;
  configKeys: Set<string> | null;
  scheduleRender: () => void;
}

let current: BrickState | null = null;
let hookIdx = 0;

/** @internal — called by brick runtime before each render */
export function _beginRender(state: BrickState) {
  current = state;
  hookIdx = 0;
}

/** @internal — called by brick runtime after each render */
export function _endRender() {
  current = null;
}

/** @internal — run pending effects after render */
export function _flushEffects(_state: BrickState) {
  // Effects are processed during the hooks themselves (deferred via queueMicrotask)
}

/** @internal — cleanup all effects on unmount */
export function _cleanupEffects(state: BrickState) {
  for (const effect of state.effects) {
    if (typeof effect.cleanup === 'function') effect.cleanup();
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
