/** Base fields shared by all component nodes */
export interface BaseNode {
  type: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-action registration
// ─────────────────────────────────────────────────────────────────────────────

/** Action handler — receives optional payload from the UI */
export type ActionHandler = (payload?: Record<string, unknown>) => void;

/**
 * Pluggable registrar — set by the SDK during brick render.
 * Receives a handler function, returns a stable string action ID.
 * Outside of a render context (e.g. tests), functions are assigned fallback IDs.
 */
let _registrar: ((handler: ActionHandler) => string) | null = null;
let _fallbackIdx = 0;

/** @internal — called by SDK to install/clear the registrar */
export function _setActionRegistrar(fn: ((handler: ActionHandler) => string) | null): void {
  _registrar = fn;
}

/**
 * Register an action handler and return its string ID for serialization.
 * Called internally by builder functions (Toggle, Button, Slider, etc.).
 */
export function resolveAction(handler: ActionHandler): string {
  if (_registrar) return _registrar(handler);
  return `__action_${_fallbackIdx++}`;
}

/** Shared flex layout props for Row, Column, and other flex containers */
export interface FlexLayoutProps {
  /** Gap between children */
  gap?: 'sm' | 'md' | 'lg';
  /** Cross-axis alignment */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Main-axis distribution */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  /** Allow wrapping */
  wrap?: boolean;
  /** Fill available space (flex-1) */
  grow?: boolean;
}

/** Extensible map — each node file self-registers via declaration merging */
export interface NodeTypeMap {}

/** Discriminated union — auto-derived, never needs manual updates */
export type ComponentNode = NodeTypeMap[keyof NodeTypeMap];

/** Child type for JSX container components */
export type Child = ComponentNode | ComponentNode[] | false | null | undefined;

/** Flatten & filter JSX children into a clean ComponentNode array */
export function normalizeChildren(children: Child | Child[]): ComponentNode[] {
  if (!children) return [];
  if (!Array.isArray(children)) return [children];
  return children.flat().filter((c): c is ComponentNode => c != null && c !== false);
}
