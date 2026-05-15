/**
 * `useBounds(ref)` — absolute terminal-cell bounds of an ink box.
 *
 *   const ref = useRef<DOMElement>(null);
 *   const bounds = useBounds(ref);
 *   useMouse((e) => {
 *     if (bounds && hitTest(bounds, e)) {
 *       onPress();
 *     }
 *   });
 *
 *   <Box ref={ref}>…</Box>
 *
 * Ink only exposes element size (`measureElement`), not screen
 * position — for hit-testing mouse clicks we need both. We reach
 * into the Yoga layout tree via the public `parentNode` /
 * `yogaNode` fields on `DOMElement` (they ARE on the public type
 * even though `measureElement` doesn't surface position) and sum
 * each node's computed-left / computed-top up to the root.
 *
 * Bounds re-measure on every render via `useLayoutEffect`, so they
 * stay in sync with layout shifts (resize, sibling re-renders).
 * Components that need stable mouse handlers should compare bounds
 * inside their click callback — `useBounds` returns the latest
 * snapshot, not a stable identity.
 */

import type { DOMElement } from 'ink';
import { type RefObject, useLayoutEffect, useState } from 'react';

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function useBounds(ref: RefObject<DOMElement | null>): Bounds | null {
  const [bounds, setBounds] = useState<Bounds | null>(null);

  useLayoutEffect(() => {
    const next = computeBounds(ref.current);
    setBounds((prev) => (sameBounds(prev, next) ? prev : next));
  });

  return bounds;
}

/** Synchronous one-shot bounds read. Use this in mouse handlers
 *  instead of `useBounds` when you only need the position at click
 *  time — it skips the per-render `useLayoutEffect` + state churn
 *  that hooking the bounds into React's commit cycle costs. */
export function readBounds(element: DOMElement | null): Bounds | null {
  return computeBounds(element);
}

export function hitTest(bounds: Bounds, point: { column: number; row: number }): boolean {
  return (
    point.column >= bounds.x &&
    point.column < bounds.x + bounds.width &&
    point.row >= bounds.y &&
    point.row < bounds.y + bounds.height
  );
}

function computeBounds(element: DOMElement | null): Bounds | null {
  if (!element?.yogaNode) {
    return null;
  }
  // Walk while the CURRENT node has a parent — this is the same
  // condition Ink's own `getAbsoluteBorderPosition` uses. Including
  // the root in the sum (the previous behaviour) double-counted the
  // root's `getComputedTop`, which Ink applies separately when it
  // paints output, so hit-test bounds ended up offset by the root
  // node's position relative to its (nonexistent) parent. The
  // visible symptom: clicks fired only when the user clicked far
  // below where the element actually rendered.
  let x = 0;
  let y = 0;
  let node: DOMElement | undefined = element;
  while (node?.parentNode && node.yogaNode) {
    x += node.yogaNode.getComputedLeft();
    y += node.yogaNode.getComputedTop();
    node = node.parentNode;
  }
  const width = element.yogaNode.getComputedWidth();
  const height = element.yogaNode.getComputedHeight();
  return { x, y, width, height };
}

function sameBounds(a: Bounds | null, b: Bounds | null): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
