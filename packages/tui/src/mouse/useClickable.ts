/**
 * `useClickable(ref, onPress, enabled?)` — fire `onPress` whenever
 * the user left-clicks anywhere inside the referenced Box. The
 * handler receives a `ClickInfo` describing both the absolute click
 * cell and its offset within the element, so callers can position
 * follow-up effects (particles, ripples, tooltips) at the exact
 * pixel that was hit.
 *
 *   const ref = useRef<DOMElement>(null);
 *   useClickable(ref, ({ relative }) => spawnSparkle(relative));
 *
 *   <Box ref={ref}>…</Box>
 *
 * **Nested clickables — innermost wins.** When several clickable
 * elements stack at the click point (a `<Clickable>` card wrapping a
 * `<Button>`, for example), only the element with the smallest area
 * fires. This sidesteps a full event-propagation system in favour
 * of the rule that fits terminal UIs: a click hits one thing. The
 * resolution happens in a microtask after every subscriber has hit-
 * tested its own bounds, so the order in which handlers register
 * doesn't matter.
 *
 * Bounds are read SYNCHRONOUSLY at click time (via `readBounds`)
 * rather than tracked through React state. That keeps the hook free
 * of per-render layout-effects + setState churn — important when
 * dozens of clickable elements live alongside an animated component
 * like `<BrixStage>` and would otherwise re-measure on every frame.
 *
 * No-ops when `onPress` is undefined or `enabled` is false — handy
 * for letting a callsite gate clicks declaratively without
 * unsubscribing the mouse listener.
 */

import type { DOMElement } from 'ink';
import { type RefObject, useCallback } from 'react';
import { type Bounds, hitTest, readBounds } from './useBounds';
import { type MouseEvent, useMouse } from './useMouse';

export interface ClickPoint {
  /** Cell coordinate (0-indexed). */
  readonly column: number;
  readonly row: number;
}

export interface ClickInfo {
  /** Absolute terminal cell — same coords the mouse event reports. */
  readonly absolute: ClickPoint;
  /** Cell offset within the clicked element. `{0,0}` is the top-left
   *  of the element's bounding box. Useful for spawning particles or
   *  ripples at exactly the click point. */
  readonly relative: ClickPoint;
  /** Snapshot of the element's bounds at click time. */
  readonly bounds: Bounds;
}

export type ClickHandler = (info: ClickInfo) => void;

/** Per-event coalescer. Every `useClickable` subscriber that
 *  hit-tests positive on the same click pushes a claim here; a
 *  microtask later we fire only the claim with the smallest bounds
 *  (the innermost element) and reset for the next event. */
interface Claim {
  readonly area: number;
  readonly fire: () => void;
}

let claims: Claim[] | null = null;

function pushClaim(claim: Claim): void {
  if (claims === null) {
    const batch: Claim[] = [claim];
    claims = batch;
    queueMicrotask(() => {
      // Seeded with the first claim so reduce() has an explicit initial
      // value — `batch` is guaranteed non-empty (we pushed `claim` above).
      const winner = batch.reduce<Claim>((a, b) => (b.area < a.area ? b : a), claim);
      winner.fire();
      claims = null;
    });
  } else {
    claims.push(claim);
  }
}

export function useClickable(
  ref: RefObject<DOMElement | null>,
  onPress: ClickHandler | undefined,
  enabled = true
): void {
  const handler = useCallback(
    (e: MouseEvent) => {
      if (!enabled || !onPress) {
        return;
      }
      if (e.button !== 'left' || e.action !== 'click') {
        return;
      }
      const bounds = readBounds(ref.current);
      if (!bounds || !hitTest(bounds, e)) {
        return;
      }
      const info: ClickInfo = {
        absolute: { column: e.column, row: e.row },
        relative: { column: e.column - bounds.x, row: e.row - bounds.y },
        bounds,
      };
      pushClaim({
        area: bounds.width * bounds.height,
        fire: () => onPress(info),
      });
    },
    [enabled, onPress, ref]
  );
  useMouse(handler);
}
