/**
 * End-to-end coverage for `useClickable` — feeds SGR mouse sequences
 * through ink-testing-library's stdin, and asserts that:
 *   - a click inside the element's bounds fires the handler,
 *   - a click outside the bounds is ignored,
 *   - drag / move / wheel events do not trigger `onPress`,
 *   - `enabled=false` suppresses the handler.
 *
 * The handler runs from a microtask scheduled by `pushClaim`, so each
 * test awaits a short flush after writing the release sequence to give
 * the `queueMicrotask` callback a chance to fire.
 */

import { describe, expect, mock, test } from 'bun:test';
import { flush } from '@brika/testing';
import { Box, type DOMElement, Text } from 'ink';
import { render } from 'ink-testing-library';
import React, { useRef } from 'react';
import { type ClickHandler, useClickable } from './useClickable';

interface ProbeProps {
  readonly onPress: ClickHandler | undefined;
  readonly enabled?: boolean;
}

function Probe({ onPress, enabled = true }: Readonly<ProbeProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, onPress, enabled);
  return React.createElement(
    Box,
    { ref, width: 10, height: 3 },
    React.createElement(Text, null, 'click me')
  );
}

/** SGR mouse-press + release at the same cell — synthesises a `click`. */
type TestStdin = { write: (data: string) => void };

function clickAt(stdin: TestStdin, col1: number, row1: number): void {
  stdin.write(`\x1b[<0;${col1};${row1}M`);
  stdin.write(`\x1b[<0;${col1};${row1}m`);
}

describe('useClickable', () => {
  test('fires the handler when the click lands inside the element bounds', async () => {
    const onPress = mock<ClickHandler>();
    const { stdin, unmount } = render(React.createElement(Probe, { onPress }));
    await flush();
    // The Probe box is 10×3 anchored at (0,0). A click at SGR (3,2)
    // → 0-based (2,1) — well inside.
    clickAt(stdin, 3, 2);
    await flush(50);
    expect(onPress).toHaveBeenCalledTimes(1);
    const info = onPress.mock.calls[0]?.[0];
    expect(info?.absolute.column).toBe(2);
    expect(info?.absolute.row).toBe(1);
    // `relative` is the offset from the element's top-left.
    expect(info?.relative.column).toBe(2);
    expect(info?.relative.row).toBe(1);
    expect(info?.bounds.width).toBe(10);
    expect(info?.bounds.height).toBe(3);
    unmount();
  });

  test('ignores a click that falls outside the element bounds', async () => {
    const onPress = mock<ClickHandler>();
    const { stdin, unmount } = render(React.createElement(Probe, { onPress }));
    await flush();
    // Click far to the right of the 10-cell wide element.
    clickAt(stdin, 50, 10);
    await flush(50);
    expect(onPress).not.toHaveBeenCalled();
    unmount();
  });

  test('ignores a drag — `useClickable` only listens for click actions', async () => {
    const onPress = mock<ClickHandler>();
    const { stdin, unmount } = render(React.createElement(Probe, { onPress }));
    await flush();
    // 32 = drag bit; never reaches the click branch.
    stdin.write('\x1b[<32;3;2M');
    await flush(50);
    expect(onPress).not.toHaveBeenCalled();
    unmount();
  });

  test('ignores wheel scrolls', async () => {
    const onPress = mock<ClickHandler>();
    const { stdin, unmount } = render(React.createElement(Probe, { onPress }));
    await flush();
    stdin.write('\x1b[<64;3;2M');
    await flush(50);
    expect(onPress).not.toHaveBeenCalled();
    unmount();
  });

  test('does not fire when `enabled` is false', async () => {
    const onPress = mock<ClickHandler>();
    const { stdin, unmount } = render(React.createElement(Probe, { onPress, enabled: false }));
    await flush();
    clickAt(stdin, 3, 2);
    await flush(50);
    expect(onPress).not.toHaveBeenCalled();
    unmount();
  });

  test('a missing onPress handler is a no-op (no crash)', async () => {
    const { stdin, unmount } = render(React.createElement(Probe, { onPress: undefined }));
    await flush();
    clickAt(stdin, 3, 2);
    await flush(50);
    // No assertion needed beyond "we didn't throw".
    unmount();
  });

  test('innermost clickable wins when nested elements claim the same cell', async () => {
    const outer = mock<ClickHandler>();
    const inner = mock<ClickHandler>();

    function NestedProbe(): React.ReactElement {
      const outerRef = useRef<DOMElement>(null);
      const innerRef = useRef<DOMElement>(null);
      useClickable(outerRef, outer);
      useClickable(innerRef, inner);
      return React.createElement(
        Box,
        { ref: outerRef, width: 20, height: 5 },
        React.createElement(
          Box,
          { ref: innerRef, width: 6, height: 2 },
          React.createElement(Text, null, 'in')
        )
      );
    }

    const { stdin, unmount } = render(React.createElement(NestedProbe));
    await flush();
    // Click at (2,1) — inside both the inner and outer box. The
    // microtask-batched claim resolution should pick the smaller area
    // (inner) and only it fires.
    clickAt(stdin, 3, 2);
    await flush(50);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    unmount();
  });
});
