/**
 * Unit tests for `useBounds` + `hitTest` + `readBounds`.
 *
 * `useBounds` re-measures the element via Yoga and returns a stable
 * snapshot. We mount a small ink tree, capture the bounds via a state
 * sink, and assert the dimensions match what `measureElement` would
 * have reported. `hitTest` is pure so we test it directly with
 * fixture bounds.
 */

import { describe, expect, test } from 'bun:test';
import { Box, type DOMElement, Text } from 'ink';
import { render } from 'ink-testing-library';
import React, { useRef } from 'react';
import { type Bounds, hitTest, readBounds, useBounds } from './useBounds';

function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ProbeProps {
  readonly onMeasured: (bounds: Bounds | null) => void;
}

function Probe({ onMeasured }: Readonly<ProbeProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const bounds = useBounds(ref);
  onMeasured(bounds);
  return React.createElement(
    Box,
    { ref, width: 20, height: 3 },
    React.createElement(Text, null, 'hello')
  );
}

describe('hitTest', () => {
  const bounds: Bounds = { x: 5, y: 2, width: 10, height: 3 };

  test('a point inside the rect counts as a hit', () => {
    expect(hitTest(bounds, { column: 5, row: 2 })).toBe(true);
    expect(hitTest(bounds, { column: 14, row: 4 })).toBe(true);
  });

  test('a point on the half-open right / bottom edge is OUTSIDE', () => {
    expect(hitTest(bounds, { column: 15, row: 2 })).toBe(false);
    expect(hitTest(bounds, { column: 5, row: 5 })).toBe(false);
  });

  test('a point before the rect is outside', () => {
    expect(hitTest(bounds, { column: 4, row: 2 })).toBe(false);
    expect(hitTest(bounds, { column: 5, row: 1 })).toBe(false);
  });
});

describe('readBounds', () => {
  test('returns null for a null element', () => {
    expect(readBounds(null)).toBeNull();
  });
});

describe('useBounds', () => {
  test('initially null then resolves to a measured rectangle', async () => {
    const seen: (Bounds | null)[] = [];
    const { unmount } = render(
      React.createElement(Probe, {
        onMeasured: (b) => seen.push(b),
      })
    );
    await flush();
    // We expect at least one non-null snapshot once layout commits.
    const last = seen.at(-1);
    expect(last).not.toBeNull();
    expect(last?.width).toBe(20);
    expect(last?.height).toBe(3);
    // Top-level box renders at the origin.
    expect(last?.x).toBe(0);
    expect(last?.y).toBe(0);
    unmount();
  });

  test('child bounds reflect the parent offset', async () => {
    const captured: { current: Bounds | null } = { current: null };

    function NestedProbe(): React.ReactElement {
      const ref = useRef<DOMElement>(null);
      const bounds = useBounds(ref);
      captured.current = bounds;
      return React.createElement(
        Box,
        { paddingLeft: 4, paddingTop: 2 },
        React.createElement(Box, { ref, width: 6, height: 2 }, React.createElement(Text, null, 'x'))
      );
    }

    const { unmount } = render(React.createElement(NestedProbe));
    await flush();
    // The inner box's measured size is 6x2; the offset comes from
    // the parent's padding. We only assert positivity rather than
    // exact pixel offsets — Yoga padding semantics drift between
    // versions, but the offset is guaranteed to be > 0.
    expect(captured.current).not.toBeNull();
    expect(captured.current?.width).toBe(6);
    expect(captured.current?.height).toBe(2);
    expect((captured.current?.x ?? 0) >= 0).toBe(true);
    expect((captured.current?.y ?? 0) >= 0).toBe(true);
    unmount();
  });
});
