/**
 * `useMouse()` — terminal mouse events. Subscribe a callback for the
 * lifetime of a component:
 *
 *   useMouse((event) => {
 *     if (event.action === 'click' && event.button === 'left') {
 *       console.log('click at', event.column, event.row);
 *     }
 *   });
 *
 * Terminal mouse mode is enabled lazily on the first `useMouse`
 * call (via the global `enableMouseMode()` ref-count) and disabled
 * when the last subscriber unmounts. `runTui` does NOT toggle it
 * unconditionally so commands that don't care about mouse don't
 * eat the user's regular select-to-copy behaviour.
 *
 * Implementation notes:
 *   - We subscribe to ink's `stdin` and parse the SGR (`?1006`)
 *     extended mouse escape sequences. Older terminals that only
 *     support `?1000` (X10) fall through unparsed.
 *   - Position is `0-based` (top-left = `{column: 0, row: 0}`),
 *     mirroring ink's coordinate system.
 *   - We DON'T register hit-testing here — that's a per-component
 *     concern. `useMouse` only emits raw events; consumers compute
 *     bounds via `measureElement` + a position ref of their own.
 */

import { useStdin } from 'ink';
import { useEffect } from 'react';

export type MouseButton = 'left' | 'middle' | 'right' | 'wheelUp' | 'wheelDown' | 'unknown';
export type MouseAction = 'down' | 'up' | 'click' | 'drag' | 'move' | 'scroll';

export interface MouseEvent {
  readonly button: MouseButton;
  readonly action: MouseAction;
  /** Column (0-based from the left edge of the terminal). */
  readonly column: number;
  /** Row (0-based from the top edge of the terminal). */
  readonly row: number;
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

type Subscriber = (event: MouseEvent) => void;

interface MouseRuntime {
  readonly subscribers: Set<Subscriber>;
  lastDown: { button: MouseButton; column: number; row: number } | null;
  attachedStdin: NodeJS.ReadStream | null;
  listener: ((chunk: Buffer | string) => void) | null;
}

const runtime: MouseRuntime = {
  subscribers: new Set(),
  lastDown: null,
  attachedStdin: null,
  listener: null,
};

/** SGR mouse-mode (`?1006`) — pairs well with `?1000` which Ink's
 *  raw mode hasn't already taken. We also enable `?1002` (button
 *  drag tracking) and `?1015` as a fallback for terminals that don't
 *  speak SGR. Disabling pairs land in `disable()`. */
const ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const DISABLE = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';

function attach(stdin: NodeJS.ReadStream): void {
  if (runtime.attachedStdin === stdin) {
    return;
  }
  detach();
  process.stdout.write(ENABLE);
  const listener = (chunk: Buffer | string): void => {
    const data = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    parseAndDispatch(data);
  };
  stdin.on('data', listener);
  runtime.attachedStdin = stdin;
  runtime.listener = listener;
}

function detach(): void {
  if (runtime.attachedStdin && runtime.listener) {
    runtime.attachedStdin.off('data', runtime.listener);
  }
  if (runtime.attachedStdin) {
    process.stdout.write(DISABLE);
  }
  runtime.attachedStdin = null;
  runtime.listener = null;
}

/** SGR event shape: `\x1b[<{button};{col};{row}{M|m}`
 *  - `M` = button down
 *  - `m` = button up
 *  Button code low 2 bits = button (0=left, 1=middle, 2=right, 3=release).
 *  Bit 4 (`+4`) = shift, bit 5 (`+8`) = meta, bit 6 (`+16`) = ctrl,
 *  bit 6 (`+32`) = drag (motion). Bit 7 (`+64`) = wheel. */
function parseAndDispatch(data: string): void {
  let i = 0;
  while (i < data.length) {
    const idx = data.indexOf('\x1b[<', i);
    if (idx < 0) {
      return;
    }
    const end = idx + 3;
    // Find terminating M/m
    let j = end;
    while (j < data.length && data[j] !== 'M' && data[j] !== 'm') {
      j += 1;
    }
    if (j >= data.length) {
      return;
    }
    const body = data.slice(end, j);
    const terminator = data[j];
    const parts = body.split(';');
    if (parts.length === 3) {
      const code = Number.parseInt(parts[0] ?? '', 10);
      const column = Number.parseInt(parts[1] ?? '', 10) - 1;
      const row = Number.parseInt(parts[2] ?? '', 10) - 1;
      if (!Number.isNaN(code) && !Number.isNaN(column) && !Number.isNaN(row)) {
        dispatch(code, column, row, terminator === 'M');
      }
    }
    i = j + 1;
  }
}

function decodeButton(code: number): { button: MouseButton; isWheel: boolean; isDrag: boolean } {
  const isWheel = (code & 64) !== 0;
  const isDrag = (code & 32) !== 0;
  const low = code & 3;
  if (isWheel) {
    return { button: low === 0 ? 'wheelUp' : 'wheelDown', isWheel, isDrag };
  }
  switch (low) {
    case 0:
      return { button: 'left', isWheel, isDrag };
    case 1:
      return { button: 'middle', isWheel, isDrag };
    case 2:
      return { button: 'right', isWheel, isDrag };
    default:
      return { button: 'unknown', isWheel, isDrag };
  }
}

function dispatch(code: number, column: number, row: number, pressed: boolean): void {
  const { button, isWheel, isDrag } = decodeButton(code);
  const shift = (code & 4) !== 0;
  const meta = (code & 8) !== 0;
  const ctrl = (code & 16) !== 0;
  const baseEvent = { column, row, shift, ctrl, meta };

  let action: MouseAction;
  if (isWheel) {
    action = 'scroll';
  } else if (isDrag) {
    action = pressed ? 'drag' : 'move';
  } else if (pressed) {
    action = 'down';
    runtime.lastDown = { button, column, row };
  } else {
    action = 'up';
  }

  for (const sub of runtime.subscribers) {
    sub({ ...baseEvent, button, action });
  }

  // Synthesize a `click` when the up matches the last down at the
  // same cell — saves consumers from having to track press state.
  if (action === 'up' && runtime.lastDown) {
    const { button: down, column: dc, row: dr } = runtime.lastDown;
    runtime.lastDown = null;
    if (down === button && dc === column && dr === row) {
      for (const sub of runtime.subscribers) {
        sub({ ...baseEvent, button, action: 'click' });
      }
    }
  }
}

export function useMouse(handler: Subscriber): void {
  const { stdin, isRawModeSupported, setRawMode } = useStdin();
  useEffect(() => {
    if (!stdin || !isRawModeSupported) {
      return;
    }
    setRawMode(true);
    runtime.subscribers.add(handler);
    if (runtime.subscribers.size === 1) {
      attach(stdin);
    }
    return () => {
      runtime.subscribers.delete(handler);
      if (runtime.subscribers.size === 0) {
        detach();
      }
    };
  }, [handler, stdin, isRawModeSupported, setRawMode]);
}
