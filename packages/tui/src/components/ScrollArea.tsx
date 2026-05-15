/**
 * `<ScrollArea>` — focus-aware scrollable wrapper for long content.
 *
 *   <ScrollArea>
 *     <Markdown source={readme} />
 *   </ScrollArea>
 *
 * **How it computes total / percent.** ScrollArea inspects its single
 * child for a `source: string` (most markdown / text renderers) or a
 * `lines: string[]` (line-based components) prop. When found, total
 * = `source.split('\n').length` (or `lines.length`), and the child is
 * re-rendered each frame via `React.cloneElement` with a sliced
 * source. The math is then pure integer arithmetic — no `useMeasure`
 * guesswork against a Yoga-clipped subtree, no "total shrinks as you
 * scroll" jitter. The user sees an honest `12-31 / 240` indicator.
 *
 * For arbitrary children with no `source` / `lines` prop, ScrollArea
 * falls back to the older `marginTop`-based wrapper mode — it works
 * for short content but is best effort on large trees where Yoga and
 * `useMeasure` disagree about the natural content height.
 *
 * Focus model:
 *   - Tab into the area or click it to grab scroll keys.
 *   - `↑` / `↓` / `j` / `k`     — one line up / down
 *   - `J` / `K`                  — fast scroll (5 lines at a time)
 *   - `Ctrl+U` / `Ctrl+D`        — one page (Mac-keyboard friendly)
 *   - `PageUp` / `PageDown`      — same, when the keyboard has them
 *   - `Home` / `g` / `Ctrl+B`    — jump to top
 *   - `End`  / `G` / `Ctrl+G`    — jump to bottom
 *   - `Esc`                      — release focus
 *
 * **Event isolation.** While focused, the area calls
 * `useCaptureInput()` so plain `useKey` calls outside any `<KeyScope>`
 * suspend — section-jump hotkeys, `/`, `q`, etc. don't fire while
 * scrolling. The area's own scroll keybinds live inside a `<KeyScope>`
 * so they bypass that suspend and keep firing.
 *
 * The status row shows `12-31 / 240  37%` plus an `Esc to exit` hint
 * while focused. Pass `statusLine={null}` to hide it.
 */

import { Box, type DOMElement, type Key, Text, useFocus, useFocusManager, useInput } from 'ink';
import React, { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { KeyScope } from '../keys/KeyScope';
import { hitTest, readBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';
import { useCaptureInput } from '../shell/useTuiShell';
import { useMeasure } from '../state/useMeasure';
import { Button } from './Button';

export interface ScrollAreaProps {
  /** Explicit visible row count. Omit to fill the flex parent — the
   *  pane measures its own window height and uses that as the slice
   *  size. The status row (1 line) always sits below the window. */
  readonly height?: number;
  readonly children?: ReactNode;
  /** Where the cursor starts. Default 0 (top). */
  readonly initialOffset?: number;
  /** Grab focus on mount when no other focusable owns it. */
  readonly autoFocus?: boolean;
  /** Stable focus id — supply it when the consumer wants to call
   *  `useFocusManager().focus(id)` from outside. */
  readonly id?: string;
  /** Skip Ink's tab-cycle for this area. Default `true`. */
  readonly focusable?: boolean;
  /** Lines per `J` / `K` press. Default `5`. */
  readonly fastScrollLines?: number;
  /** Fires when the scroll offset changes. */
  readonly onScrollChange?: (offset: number) => void;
  /** Tweak the chrome label. Pass `null` to hide it. */
  readonly statusLine?: ((info: ScrollState) => ReactNode) | null;
  /** Border color when focused. Default 'cyan'. */
  readonly accent?: string;
}

export interface ScrollState {
  /** Top row currently visible (0-based). */
  readonly offset: number;
  /** Total rows the area is scrolling through. */
  readonly totalRows: number;
  /** Visible window size. */
  readonly height: number;
  readonly focused: boolean;
}

const MIN_HEIGHT = 1;
/** Floor for page-step size before the first measurement lands. */
const MIN_PAGE = 10;

const HOME_SEQUENCES: ReadonlySet<string> = new Set(['[H', '[1~', 'OH']);
const END_SEQUENCES: ReadonlySet<string> = new Set(['[F', '[4~', 'OF']);

export function ScrollArea(props: Readonly<ScrollAreaProps>): React.ReactElement {
  return (
    <KeyScope>
      <ScrollAreaInner {...props} />
    </KeyScope>
  );
}

/** Probe the single child for a slice-able source. */
interface Sliceable {
  readonly kind: 'source' | 'lines';
  readonly element: React.ReactElement;
  readonly totalLines: number;
  /** Build the props patch we'll hand to `cloneElement` for the
   *  visible window. */
  readonly slice: (from: number, to: number) => Record<string, unknown>;
}

function isReadableProps(p: unknown): p is Record<string, unknown> {
  return typeof p === 'object' && p !== null;
}

function detectSliceable(children: ReactNode): Sliceable | null {
  const arr = React.Children.toArray(children).filter(React.isValidElement);
  if (arr.length !== 1) {
    return null;
  }
  const only = arr[0];
  if (!only || !isReadableProps(only.props)) {
    return null;
  }
  const source = only.props.source;
  if (typeof source === 'string') {
    const lines = source.split('\n');
    return {
      kind: 'source',
      element: only,
      totalLines: lines.length,
      slice: (from, to) => ({ source: lines.slice(from, to).join('\n') }),
    };
  }
  const linesProp = only.props.lines;
  if (Array.isArray(linesProp)) {
    return {
      kind: 'lines',
      element: only,
      totalLines: linesProp.length,
      slice: (from, to) => ({ lines: linesProp.slice(from, to) }),
    };
  }
  return null;
}

function ScrollAreaInner({
  height,
  children,
  initialOffset = 0,
  autoFocus = false,
  id,
  focusable = true,
  fastScrollLines = 5,
  onScrollChange,
  statusLine,
  accent = 'cyan',
}: Readonly<ScrollAreaProps>): React.ReactElement {
  const autoId = useId();
  const focusId = id ?? `scrollarea-${autoId}`;
  const { isFocused } = useFocus({ autoFocus, id: focusId, isActive: focusable });
  const { focus, focusNext } = useFocusManager();

  useCaptureInput(isFocused);

  // We only measure the WINDOW box (to know how many rows to slice).
  // The inner content height comes from the child's source / lines
  // when available; we never have to ask Yoga "how tall did this get?"
  const [windowRef, windowSize] = useMeasure();
  const STATUS_ROWS = statusLine === null ? 0 : 1;
  const visibleRows = height
    ? Math.max(MIN_HEIGHT, height)
    : Math.max(MIN_HEIGHT, windowSize.height - STATUS_ROWS);

  const sliceable = detectSliceable(children);
  // Wrapper-mode fallback also needs a measurable inner-content height
  // for max-offset math. Source/lines mode bypasses this entirely.
  const [innerRef, innerSize] = useMeasure();
  const totalRows = sliceable ? sliceable.totalLines : Math.max(innerSize.height, visibleRows);
  const maxOffset = Math.max(0, totalRows - visibleRows);

  const [offset, setOffset] = useState(initialOffset);

  useEffect(() => {
    setOffset((cur) => (cur > maxOffset ? maxOffset : cur));
  }, [maxOffset]);

  const maxOffsetRef = useRef(maxOffset);
  maxOffsetRef.current = maxOffset;
  const pageStepRef = useRef(MIN_PAGE);
  pageStepRef.current = Math.max(MIN_PAGE, visibleRows - 1);

  const onChangeRef = useRef(onScrollChange);
  onChangeRef.current = onScrollChange;

  const move = useCallback((delta: number) => {
    setOffset((cur) => {
      const next = clamp(cur + delta, 0, maxOffsetRef.current);
      if (next !== cur) {
        onChangeRef.current?.(next);
      }
      return next;
    });
  }, []);

  const jumpTo = useCallback((target: 'top' | 'bottom') => {
    setOffset((cur) => {
      const next = target === 'top' ? 0 : maxOffsetRef.current;
      if (next !== cur) {
        onChangeRef.current?.(next);
      }
      return next;
    });
  }, []);

  // One direct `useInput` for every scroll key. The previous design
  // had ~15 stacked `useKey` calls, each registering its own ink
  // useInput subscription — that was fragile (any one of them
  // de-activating would break navigation) and made debugging
  // miserable. A single dispatcher is bulletproof: while focused,
  // every key is routed through this one function.
  const dispatch = useCallback(
    (input: string, key: Key) => {
      const page = pageStepRef.current;
      if (handleNavKey(key, page, move, focusNext)) {
        return;
      }
      if (key.ctrl && handleCtrlChar(input, page, move, jumpTo)) {
        return;
      }
      if (!key.ctrl && handleVimChar(input, fastScrollLines, move, jumpTo)) {
        return;
      }
      if (HOME_SEQUENCES.has(input)) {
        jumpTo('top');
      } else if (END_SEQUENCES.has(input)) {
        jumpTo('bottom');
      }
    },
    [move, jumpTo, focusNext, fastScrollLines]
  );
  useInput(dispatch, { isActive: isFocused });

  const containerRef = useRef<DOMElement>(null);
  const onMouse = useCallback(
    (e: MouseEvent) => {
      if (e.action !== 'click' || e.button !== 'left') {
        return;
      }
      const bounds = readBounds(containerRef.current);
      if (!bounds || !hitTest(bounds, e)) {
        return;
      }
      focus(focusId);
    },
    [focus, focusId]
  );
  useMouse(onMouse);

  const state: ScrollState = { offset, totalRows, height: visibleRows, focused: isFocused };
  const chrome = renderStatus(statusLine, state, accent);

  const atTop = offset === 0;
  const atBottom = offset >= maxOffset;
  const showActions = isFocused;

  // Render the body — slice mode (cloneElement with sliced source/
  // lines) when the child supports it, marginTop fallback otherwise.
  let body: ReactNode;
  if (sliceable) {
    const sliced = sliceable.slice(offset, offset + visibleRows);
    body = React.cloneElement(sliceable.element, sliced);
  } else {
    body = (
      <Box ref={innerRef} flexDirection="column" flexShrink={0} marginTop={-offset}>
        {children}
      </Box>
    );
  }

  const windowProps = height ? { height: visibleRows } : { flexGrow: 1, flexShrink: 1 };

  return (
    <Box
      ref={containerRef}
      flexDirection="column"
      flexGrow={height ? 0 : 1}
      flexShrink={height ? 0 : 1}
      borderStyle={isFocused ? 'bold' : 'round'}
      borderColor={isFocused ? accent : 'gray'}
      borderDimColor={!isFocused}
      paddingX={1}
    >
      <Box ref={windowRef} flexDirection="column" overflow="hidden" {...windowProps}>
        {body}
      </Box>
      {showActions ? (
        <Box flexShrink={0}>
          <Button shortcut="g" tabIndex={-1} enabled={!atTop} onPress={() => jumpTo('top')}>
            top
          </Button>
          <Button shortcut="G" tabIndex={-1} enabled={!atBottom} onPress={() => jumpTo('bottom')}>
            bottom
          </Button>
        </Box>
      ) : null}
      {chrome ? <Box flexShrink={0}>{chrome}</Box> : null}
    </Box>
  );
}

/** Named arrow / page / escape handler. Returns true when the key was
 *  consumed so the parent dispatcher can stop looking. */
function handleNavKey(
  key: Key,
  page: number,
  move: (delta: number) => void,
  focusNext: () => void
): boolean {
  if (key.upArrow) {
    move(-1);
    return true;
  }
  if (key.downArrow) {
    move(1);
    return true;
  }
  if (key.pageUp) {
    move(-page);
    return true;
  }
  if (key.pageDown) {
    move(page);
    return true;
  }
  if (key.escape) {
    focusNext();
    return true;
  }
  return false;
}

function handleCtrlChar(
  input: string,
  page: number,
  move: (delta: number) => void,
  jumpTo: (target: 'top' | 'bottom') => void
): boolean {
  switch (input) {
    case 'u':
      move(-page);
      return true;
    case 'd':
      move(page);
      return true;
    case 'b':
      jumpTo('top');
      return true;
    case 'g':
      jumpTo('bottom');
      return true;
    default:
      return false;
  }
}

function handleVimChar(
  input: string,
  fast: number,
  move: (delta: number) => void,
  jumpTo: (target: 'top' | 'bottom') => void
): boolean {
  switch (input) {
    case 'k':
      move(-1);
      return true;
    case 'j':
      move(1);
      return true;
    case 'K':
      move(-fast);
      return true;
    case 'J':
      move(fast);
      return true;
    case 'g':
      jumpTo('top');
      return true;
    case 'G':
      jumpTo('bottom');
      return true;
    default:
      return false;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function renderStatus(
  override: ScrollAreaProps['statusLine'],
  state: ScrollState,
  accent: string
): ReactNode {
  if (override === null) {
    return null;
  }
  if (override) {
    return override(state);
  }
  return <DefaultStatus state={state} accent={accent} />;
}

function DefaultStatus({
  state,
  accent,
}: Readonly<{ state: ScrollState; accent: string }>): React.ReactElement {
  const { offset, totalRows, height, focused } = state;
  const end = Math.min(totalRows, offset + height);
  const atTop = offset === 0;
  const atBot = end >= totalRows;
  const position = totalRows === 0 ? '0/0' : `${offset + 1}-${end}/${totalRows}`;
  const pct =
    totalRows <= height
      ? '100%'
      : `${Math.round((offset / Math.max(1, totalRows - height)) * 100)}%`;
  const arrows = `${atTop ? '·' : '↑'} ${atBot ? '·' : '↓'}`;
  return (
    <Text dimColor>
      <Text color={focused ? accent : undefined}>{arrows}</Text>
      <Text>{`  ${position}`}</Text>
      <Text>{`  ${pct}`}</Text>
      {focused ? <Text>{'  ·  Esc to exit'}</Text> : <Text>{'  ·  Tab to scroll'}</Text>}
    </Text>
  );
}
