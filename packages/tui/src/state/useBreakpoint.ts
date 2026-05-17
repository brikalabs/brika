/**
 * Tailwind-style responsive breakpoints, sized for terminal widths.
 *
 *   base  — every width (no minimum)
 *   sm    — 60 cols  (narrow ssh window / small split)
 *   md    — 80 cols  (the classic 80-col terminal)
 *   lg    — 120 cols (modern IDE-embedded terminal)
 *   xl    — 160 cols (ultrawide / fullscreen on a 16:9 monitor)
 *
 * Two hooks:
 *
 *   const bp = useBreakpoint();      // { current, sm, md, lg, xl, isAtLeast }
 *   const value = useResponsiveValue({ base: 'column', md: 'row' });
 *
 * Helpers consume `useTerminalSize()` so they react to live terminal
 * resizes — no debouncing needed; Yoga re-runs layout on every render.
 *
 * Resolution order matches Tailwind: a value at `md` applies at md,
 * lg, and xl unless a larger breakpoint overrides it. The implicit
 * `base` is the floor — used when nothing else matches.
 */

import { useMemo } from 'react';
import { useTerminalSize } from './useTerminalSize';

export type Breakpoint = 'base' | 'sm' | 'md' | 'lg' | 'xl';

/** Lower bound (in cells/cols) at which each breakpoint becomes active. */
export const BREAKPOINTS: Readonly<Record<Breakpoint, number>> = {
  base: 0,
  sm: 60,
  md: 80,
  lg: 120,
  xl: 160,
};

/** Order from smallest to largest. Used for active-breakpoint lookup
 *  and for resolving responsive values via `closest larger or equal`. */
const ORDER: ReadonlyArray<Breakpoint> = ['base', 'sm', 'md', 'lg', 'xl'];

/** A value that may be a plain T or a breakpoint-keyed override map.
 *  `{ base: A, md: B }` reads as "A from `base` up, B from `md` up". */
export type Responsive<T> = T | Partial<Readonly<Record<Breakpoint, T>>>;

export interface BreakpointState {
  /** The largest matching breakpoint for the current terminal width. */
  readonly current: Breakpoint;
  /** Convenience flags — each is `columns >= BREAKPOINTS[name]`. */
  readonly sm: boolean;
  readonly md: boolean;
  readonly lg: boolean;
  readonly xl: boolean;
  /** Predicate for "is the terminal at least this size?". */
  isAtLeast(bp: Breakpoint): boolean;
}

function activeBreakpoint(columns: number): Breakpoint {
  let active: Breakpoint = 'base';
  for (const bp of ORDER) {
    if (columns >= BREAKPOINTS[bp]) {
      active = bp;
    }
  }
  return active;
}

export function useBreakpoint(): BreakpointState {
  const { columns } = useTerminalSize();
  return useMemo<BreakpointState>(() => {
    const current = activeBreakpoint(columns);
    const idx = ORDER.indexOf(current);
    return {
      current,
      sm: columns >= BREAKPOINTS.sm,
      md: columns >= BREAKPOINTS.md,
      lg: columns >= BREAKPOINTS.lg,
      xl: columns >= BREAKPOINTS.xl,
      isAtLeast(bp) {
        return idx >= ORDER.indexOf(bp);
      },
    };
  }, [columns]);
}

function isBreakpointMap<T>(
  value: Responsive<T>
): value is Partial<Readonly<Record<Breakpoint, T>>> {
  // Plain values (string, number, boolean, null, arrays, ReactElements,
  // functions) all fail the "has a breakpoint key" test — that's
  // safer than typeof checks since callers can pass any shape.
  if (value === null || typeof value !== 'object') {
    return false;
  }
  // React elements & arrays must be treated as plain values, not maps.
  if (Array.isArray(value)) {
    return false;
  }
  return ORDER.some((bp) => bp in value);
}

/** Resolve a responsive value against the active breakpoint. Walks
 *  DOWN from the active breakpoint to `base`, returning the first
 *  override that's actually defined. */
export function resolveResponsive<T>(value: Responsive<T>, current: Breakpoint): T | undefined {
  if (!isBreakpointMap(value)) {
    return value;
  }
  const idx = ORDER.indexOf(current);
  for (let i = idx; i >= 0; i -= 1) {
    const bp = ORDER[i];
    if (bp && bp in value) {
      const v = value[bp];
      if (v !== undefined) {
        return v;
      }
    }
  }
  return undefined;
}

/** Hook flavour of `resolveResponsive`. Re-evaluates on terminal
 *  resize via `useBreakpoint`. */
export function useResponsiveValue<T>(value: Responsive<T>): T | undefined;
export function useResponsiveValue<T>(value: Responsive<T>, fallback: T): T;
export function useResponsiveValue<T>(value: Responsive<T>, fallback?: T): T | undefined {
  const { current } = useBreakpoint();
  const resolved = resolveResponsive(value, current);
  return resolved ?? fallback;
}
