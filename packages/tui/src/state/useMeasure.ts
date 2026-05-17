/**
 * Post-render box measurement. Attach the returned ref to an ink `<Box>`
 * to capture its rendered width/height after yoga lays it out.
 *
 *   const [ref, { height }] = useMeasure();
 *   return <Box ref={ref} flexGrow={1}>…</Box>;
 *
 * Why? ink's flex layout is solved at render time by yoga, but consumers
 * (log windowing, tail size) need the resulting pixel count BEFORE they
 * can decide what to render inside the box. The first frame uses
 * fallback values (0×0 here) and the second frame has the real numbers
 * — typical "measure-then-window" cycle. Two frames is invisible to a
 * human; ink's render loop is sub-millisecond on modern terminals.
 *
 * The hook re-measures after every render. `measureElement` is a cheap
 * tree-walk; only a state update happens when the size actually changes,
 * so this doesn't loop.
 */

import { type DOMElement, measureElement } from 'ink';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

export function useMeasure(): readonly [RefObject<DOMElement | null>, BoxSize] {
  const ref = useRef<DOMElement | null>(null);
  const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 });

  // `useLayoutEffect` runs synchronously after the commit, before the
  // next paint — so when the terminal resizes (or any other re-render
  // happens) and Yoga lays out the new geometry, we pick the size up
  // BEFORE the user sees the new frame. With `useEffect` the first
  // post-resize paint shows the stale `size`, then a second commit
  // catches up: visible as a one-frame scroll-area "jump".
  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    const measured = measureElement(ref.current);
    if (measured.width !== size.width || measured.height !== size.height) {
      setSize({ width: measured.width, height: measured.height });
    }
  });

  return [ref, size] as const;
}
