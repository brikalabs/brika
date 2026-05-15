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
 * call and disabled when the last subscriber unmounts. `runTui` does
 * NOT toggle it unconditionally so commands that don't care about
 * mouse don't eat the user's regular select-to-copy behaviour.
 *
 * **The data-stream split**
 *
 * SGR mouse-mode (`?1006`) reports clicks as escape sequences on the
 * same stdin Ink is reading for keystrokes. Without intervention,
 * Ink's keypress parser sees `\x1b[<0;53;25M`, doesn't recognise it,
 * and forwards the raw characters to `useInput` — which an `<Input>`
 * happily inserts as if the user typed `[<0;53;25M`. To avoid that
 * leak we monkey-patch `process.stdin.emit('data', …)` the first
 * time a `useMouse` mounts:
 *
 *   - Mouse SGR sequences are extracted and dispatched to our
 *     subscribers directly.
 *   - The remaining (non-mouse) bytes are re-emitted as a new
 *     `'data'` payload that all other listeners (Ink) receive.
 *   - When the last subscriber unmounts, the original `emit` is
 *     restored.
 *
 * Implementation notes:
 *   - Position is `0-based` (top-left = `{column: 0, row: 0}`),
 *     mirroring ink's coordinate system.
 *   - Partial SGR sequences split across chunks are stashed in
 *     `runtime.pending` and concatenated with the next chunk so a
 *     fast click+drag burst doesn't drop bytes.
 *   - We DON'T register hit-testing here — that's a per-component
 *     concern. `useMouse` only emits raw events; consumers compute
 *     bounds via `measureElement` + a position ref of their own.
 */

import { useStdin } from 'ink';
import { useEffect, useRef } from 'react';

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
type EmitFn = (event: string | symbol, ...args: unknown[]) => boolean;

interface MouseRuntime {
  readonly subscribers: Set<Subscriber>;
  lastDown: { button: MouseButton; column: number; row: number } | null;
  attachedStdin: NodeJS.ReadStream | null;
  originalEmit: EmitFn | null;
  /** Partial SGR sequence carried over from the previous chunk. */
  pending: Buffer;
  exitListener: (() => void) | null;
}

const runtime: MouseRuntime = {
  subscribers: new Set(),
  lastDown: null,
  attachedStdin: null,
  originalEmit: null,
  pending: Buffer.alloc(0),
  exitListener: null,
};

/** SGR mouse-mode (`?1006`) — pairs with `?1000` (button events)
 *  and `?1002` (drag tracking). Disabling pairs land in `disable()`. */
const ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const DISABLE = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';

const ESC = 0x1b;
const LBRACKET = 0x5b; // '['
const LANGLE = 0x3c; // '<'
const M_UPPER = 0x4d; // 'M' — button down
const M_LOWER = 0x6d; // 'm' — button up

/**
 * Split a stdin chunk into "carry on to other listeners" bytes and
 * complete SGR mouse sequences. Any trailing partial mouse sequence
 * (chunk ended mid-escape) is returned in `leftover` so the next
 * call can prepend it.
 */
function splitChunk(input: Buffer): {
  cleaned: Buffer;
  sequences: Buffer[];
  leftover: Buffer;
} {
  const cleanedParts: Buffer[] = [];
  const sequences: Buffer[] = [];
  let i = 0;
  let cleanStart = 0;

  while (i < input.length) {
    if (input[i] === ESC && input[i + 1] === LBRACKET && input[i + 2] === LANGLE) {
      // Flush bytes up to this escape into cleaned.
      if (i > cleanStart) {
        cleanedParts.push(input.subarray(cleanStart, i));
      }
      // Scan for terminator.
      let j = i + 3;
      while (j < input.length && input[j] !== M_UPPER && input[j] !== M_LOWER) {
        j += 1;
      }
      if (j >= input.length) {
        // Incomplete — stash the partial in leftover.
        return {
          cleaned: Buffer.concat(cleanedParts),
          sequences,
          leftover: input.subarray(i),
        };
      }
      sequences.push(input.subarray(i, j + 1));
      i = j + 1;
      cleanStart = i;
      continue;
    }
    i += 1;
  }
  if (cleanStart < input.length) {
    cleanedParts.push(input.subarray(cleanStart));
  }
  return {
    cleaned: Buffer.concat(cleanedParts),
    sequences,
    leftover: Buffer.alloc(0),
  };
}

function parseSequence(seq: Buffer): void {
  // `seq` is `\x1b[<{code};{col};{row}{M|m}`
  const body = seq.subarray(3, seq.length - 1).toString('ascii');
  const terminator = seq[seq.length - 1];
  const parts = body.split(';');
  if (parts.length !== 3) {
    return;
  }
  const code = Number.parseInt(parts[0] ?? '', 10);
  const column = Number.parseInt(parts[1] ?? '', 10) - 1;
  const row = Number.parseInt(parts[2] ?? '', 10) - 1;
  if (Number.isNaN(code) || Number.isNaN(column) || Number.isNaN(row)) {
    return;
  }
  dispatch(code, column, row, terminator === M_UPPER);
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

  emitToSubscribers({ ...baseEvent, button, action });

  // Synthesize a `click` when the up matches the last down at the
  // same cell — saves consumers from having to track press state.
  if (action === 'up' && runtime.lastDown) {
    const { button: down, column: dc, row: dr } = runtime.lastDown;
    runtime.lastDown = null;
    if (down === button && dc === column && dr === row) {
      emitToSubscribers({ ...baseEvent, button, action: 'click' });
    }
  }
}

function emitToSubscribers(event: MouseEvent): void {
  for (const sub of runtime.subscribers) {
    sub(event);
  }
}

function attach(stdin: NodeJS.ReadStream): void {
  if (runtime.attachedStdin === stdin) {
    return;
  }
  detach();
  try {
    process.stdout.write(ENABLE);
  } catch {
    // stdout may have closed already (parent process detach); the
    // user just won't get mouse events. Don't crash the TUI.
  }

  // Monkey-patch `emit('data', …)` so we can pull mouse SGR
  // sequences out BEFORE other listeners (notably Ink's keystroke
  // parser) see them. All other events pass through untouched.
  runtime.originalEmit = stdin.emit.bind(stdin) as EmitFn;
  const orig = runtime.originalEmit;
  stdin.emit = ((event: string | symbol, ...args: unknown[]): boolean => {
    if (event !== 'data') {
      return orig(event, ...args);
    }
    const raw = args[0];
    const buf = toBuffer(raw);
    const combined = runtime.pending.length > 0 ? Buffer.concat([runtime.pending, buf]) : buf;
    const { cleaned, sequences, leftover } = splitChunk(combined);
    runtime.pending = leftover;
    for (const seq of sequences) {
      parseSequence(seq);
    }
    if (cleaned.length === 0) {
      // Nothing left for keystroke listeners — swallow the event.
      return false;
    }
    return orig('data', cleaned);
  }) as typeof stdin.emit;

  runtime.attachedStdin = stdin;

  // Best-effort terminal cleanup if the process exits without
  // unmounting (Ctrl+C bypassing our React tree, crash, etc.) —
  // otherwise the user's shell inherits enabled mouse mode and
  // every click prints garbled escape sequences.
  const onExit = (): void => {
    try {
      process.stdout.write(DISABLE);
    } catch {
      // stdout already gone — nothing else to do.
    }
  };
  process.once('exit', onExit);
  runtime.exitListener = onExit;
}

function detach(): void {
  if (runtime.attachedStdin && runtime.originalEmit) {
    runtime.attachedStdin.emit = runtime.originalEmit as typeof runtime.attachedStdin.emit;
  }
  if (runtime.attachedStdin) {
    try {
      process.stdout.write(DISABLE);
    } catch {
      // stdout closed already; nothing else to do.
    }
  }
  if (runtime.exitListener) {
    process.off('exit', runtime.exitListener);
    runtime.exitListener = null;
  }
  runtime.attachedStdin = null;
  runtime.originalEmit = null;
  runtime.pending = Buffer.alloc(0);
  runtime.lastDown = null;
}

function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    return Buffer.from(raw, 'utf8');
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw);
  }
  // Unknown shape — best effort.
  return Buffer.from(String(raw), 'utf8');
}

export function useMouse(handler: Subscriber): void {
  const { stdin, isRawModeSupported, setRawMode } = useStdin();
  // Stash the caller's handler in a ref + subscribe a stable
  // proxy. Without this, every parent re-render hands us a new
  // closure, the cleanup pulls the old one out of `subscribers`,
  // and (if it was the only consumer) we'd thrash through detach +
  // re-attach on each frame — visible as a brief mouse-mode flicker.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!stdin || !isRawModeSupported) {
      return;
    }
    setRawMode(true);
    const proxy: Subscriber = (event) => handlerRef.current(event);
    runtime.subscribers.add(proxy);
    if (runtime.subscribers.size === 1) {
      attach(stdin);
    }
    return () => {
      runtime.subscribers.delete(proxy);
      if (runtime.subscribers.size === 0) {
        detach();
      }
    };
  }, [stdin, isRawModeSupported, setRawMode]);
}
