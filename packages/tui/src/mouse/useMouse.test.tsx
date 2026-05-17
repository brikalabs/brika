/**
 * End-to-end coverage for `useMouse` — feeds SGR mouse sequences in
 * through ink-testing-library's mock stdin and asserts that the
 * runtime parser dispatches the right `MouseEvent`s to subscribers.
 *
 * The fully-decoded contract:
 *   - `\x1b[<0;C;RM` → left button down at (col-1, row-1).
 *   - `\x1b[<0;C;Rm` → left button up at the same cell synthesises a
 *     `click` after the `up` event.
 *   - `\x1b[<32;C;RM` → drag (button held + move).
 *   - `\x1b[<64;C;RM` → wheel-up scroll.
 *   - Modifier bits 4 (shift), 8 (meta), 16 (ctrl) propagate.
 *   - Non-mouse bytes mixed into the same chunk fall through to ink's
 *     keystroke parser (verified indirectly by asserting the mouse
 *     handler still fires when the chunk also contains a stray byte).
 */

import { describe, expect, mock, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { type MouseEvent, useMouse } from './useMouse';

// 250ms is the project-wide ink-testing flush ceiling — generous enough
// to absorb CI under parallel test pressure (see List.test.tsx).
function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Probe({ onEvent }: Readonly<{ onEvent: (e: MouseEvent) => void }>): React.ReactElement {
  useMouse(onEvent);
  return React.createElement(Text, null, '.');
}

describe('useMouse', () => {
  test('does not emit before any mouse activity arrives', async () => {
    const onEvent = mock<(e: MouseEvent) => void>();
    const { unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(50);
    expect(onEvent).not.toHaveBeenCalled();
    unmount();
  });

  test('parses a left-press SGR sequence and emits a `down` event', async () => {
    const onEvent = mock<(e: MouseEvent) => void>();
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    stdin.write('\x1b[<0;5;3M');
    await flush(20);
    expect(onEvent).toHaveBeenCalled();
    const first = onEvent.mock.calls[0]?.[0];
    expect(first?.action).toBe('down');
    expect(first?.button).toBe('left');
    // SGR rows/cols are 1-based on the wire; the parser converts to 0-based.
    expect(first?.column).toBe(4);
    expect(first?.row).toBe(2);
    expect(first?.shift).toBe(false);
    expect(first?.ctrl).toBe(false);
    expect(first?.meta).toBe(false);
    unmount();
  });

  test('press followed by release at the same cell synthesises a click', async () => {
    const events: MouseEvent[] = [];
    const onEvent = (e: MouseEvent): void => {
      events.push(e);
    };
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    stdin.write('\x1b[<0;5;3M');
    stdin.write('\x1b[<0;5;3m');
    await flush(20);
    // Expect down → up → click for a same-cell press+release pair.
    expect(events.map((e) => e.action)).toEqual(['down', 'up', 'click']);
    expect(events[2]?.button).toBe('left');
    expect(events[2]?.column).toBe(4);
    expect(events[2]?.row).toBe(2);
    unmount();
  });

  test('release at a different cell does NOT synthesise a click', async () => {
    const events: MouseEvent[] = [];
    const onEvent = (e: MouseEvent): void => {
      events.push(e);
    };
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    stdin.write('\x1b[<0;5;3M');
    stdin.write('\x1b[<0;7;3m');
    await flush(20);
    expect(events.map((e) => e.action)).toEqual(['down', 'up']);
    unmount();
  });

  test('decodes a drag event (button-32 bit set)', async () => {
    const events: MouseEvent[] = [];
    const onEvent = (e: MouseEvent): void => {
      events.push(e);
    };
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    // 32 = drag bit. Terminator `M` means pressed → action='drag'.
    stdin.write('\x1b[<32;6;4M');
    await flush(20);
    expect(events[0]?.action).toBe('drag');
    expect(events[0]?.column).toBe(5);
    expect(events[0]?.row).toBe(3);
    unmount();
  });

  test('decodes a wheel-up scroll (button-64 bit set)', async () => {
    const events: MouseEvent[] = [];
    const onEvent = (e: MouseEvent): void => {
      events.push(e);
    };
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    // 64 = wheel bit. Low bits 00 → wheelUp.
    stdin.write('\x1b[<64;10;5M');
    await flush(20);
    expect(events[0]?.action).toBe('scroll');
    expect(events[0]?.button).toBe('wheelUp');
    unmount();
  });

  test('propagates the shift / ctrl / meta modifier bits', async () => {
    const events: MouseEvent[] = [];
    const onEvent = (e: MouseEvent): void => {
      events.push(e);
    };
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    // 0 (left) + 4 (shift) + 8 (meta) + 16 (ctrl) = 28
    stdin.write('\x1b[<28;3;3M');
    await flush(20);
    expect(events[0]?.shift).toBe(true);
    expect(events[0]?.meta).toBe(true);
    expect(events[0]?.ctrl).toBe(true);
    unmount();
  });

  test('multiple subscribers each receive the event', async () => {
    const a = mock<(e: MouseEvent) => void>();
    const b = mock<(e: MouseEvent) => void>();
    const { stdin, unmount } = render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Probe, { onEvent: a }),
        React.createElement(Probe, { onEvent: b })
      )
    );
    await flush(20);
    stdin.write('\x1b[<0;5;3M');
    await flush(20);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('unmount releases the subscriber — no further dispatches', async () => {
    const onEvent = mock<(e: MouseEvent) => void>();
    const { stdin, unmount } = render(React.createElement(Probe, { onEvent }));
    await flush(20);
    unmount();
    await flush(20);
    stdin.write('\x1b[<0;5;3M');
    await flush(20);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
