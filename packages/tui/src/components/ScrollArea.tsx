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
 * guesswork against a Yoga-clipped subtree.
 *
 * For arbitrary children with no `source` / `lines` prop, ScrollArea
 * falls back to the older `marginTop`-based wrapper mode.
 *
 * Focus model:
 *   - Tab into the area or click it to grab scroll keys.
 *   - `↑` / `↓` / `j` / `k`     — one line up / down
 *   - `J` / `K`                  — fast scroll (5 lines at a time)
 *   - `Ctrl+U` / `Ctrl+D`        — one page
 *   - `PageUp` / `PageDown`      — same, when the keyboard has them
 *   - `Home` / `g` / `Ctrl+B`    — jump to top
 *   - `End`  / `G` / `Ctrl+G`    — jump to bottom
 *
 * Scroll keys only fire while the area has focus so siblings (List,
 * Tabs, Buttons) keep their normal input handling. We deliberately do
 * NOT bind `Esc` — Esc is reserved for the page-level "back" action;
 * press Tab to leave the scroll area when something else needs focus.
 */

import { Box, type DOMElement, type Key, Text, useFocus, useFocusManager, useInput } from 'ink';
import React, {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFocusActive } from '../keys/FocusActive';
import { KeyScope } from '../keys/KeyScope';
import { hitTest, readBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';
import { useMeasure } from '../state/useMeasure';
import { useTerminalSize } from '../state/useTerminalSize';
import { Button } from './Button';

export interface ScrollAreaProps {
  readonly height?: number;
  readonly children?: ReactNode;
  readonly initialOffset?: number;
  readonly autoFocus?: boolean;
  readonly id?: string;
  readonly focusable?: boolean;
  readonly fastScrollLines?: number;
  readonly onScrollChange?: (offset: number) => void;
  readonly statusLine?: ((info: ScrollState) => ReactNode) | null;
  readonly accent?: string;
}

export interface ScrollState {
  readonly offset: number;
  readonly totalRows: number;
  readonly height: number;
  readonly focused: boolean;
}

const MIN_HEIGHT = 1;
const MIN_PAGE = 10;

const HOME_SEQUENCES: ReadonlySet<string> = new Set(['[H', '[1~', 'OH']);
const END_SEQUENCES: ReadonlySet<string> = new Set(['[F', '[4~', 'OF']);

export function ScrollArea(props: Readonly<ScrollAreaProps>): React.ReactElement {
  // Wrap in `<KeyScope>` so the area's own scroll keys keep firing
  // even when a sibling Input (a parent Form, an overlay search box,
  // …) holds the shell's capture flag.
  return (
    <KeyScope>
      <ScrollAreaInner {...props} />
    </KeyScope>
  );
}

interface Sliceable {
  readonly kind: 'source' | 'lines' | 'window';
  readonly element: React.ReactElement;
  readonly totalLines: number;
  readonly slice: (from: number, to: number) => Record<string, unknown>;
}

function isReadableProps(p: unknown): p is Record<string, unknown> {
  return typeof p === 'object' && p !== null;
}

/** Component-side opt-in: when the child's type carries a truthy
 *  `rowWindowable` marker, ScrollArea passes `{from, to}` instead of
 *  rebuilding the sliced `source` string per scroll. Lets the child
 *  memoise its parse against a stable full source — the difference
 *  between a smooth scroll and a re-tokenise-per-keystroke. */
function isRowWindowable(type: unknown): boolean {
  if (typeof type !== 'function' && typeof type !== 'object') {
    return false;
  }
  return (type as { rowWindowable?: unknown }).rowWindowable === true;
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
  const windowable = isRowWindowable(only.type);
  const fromSource = sliceableFromSource(only, windowable);
  if (fromSource) {
    return fromSource;
  }
  return sliceableFromLines(only, windowable);
}

function sliceableFromSource(only: React.ReactElement, windowable: boolean): Sliceable | null {
  const props = only.props as Record<string, unknown>;
  const source = props.source;
  if (typeof source !== 'string') {
    return null;
  }
  const lines = source.split('\n');
  if (windowable) {
    return {
      kind: 'window',
      element: only,
      totalLines: lines.length,
      slice: (from, to) => ({ from, to }),
    };
  }
  return {
    kind: 'source',
    element: only,
    totalLines: lines.length,
    slice: (from, to) => ({ source: lines.slice(from, to).join('\n') }),
  };
}

function sliceableFromLines(only: React.ReactElement, windowable: boolean): Sliceable | null {
  const props = only.props as Record<string, unknown>;
  const linesProp = props.lines;
  if (!Array.isArray(linesProp)) {
    return null;
  }
  if (windowable) {
    return {
      kind: 'window',
      element: only,
      totalLines: linesProp.length,
      slice: (from, to) => ({ from, to }),
    };
  }
  return {
    kind: 'lines',
    element: only,
    totalLines: linesProp.length,
    slice: (from, to) => ({ lines: linesProp.slice(from, to) }),
  };
}

interface ScrollController {
  readonly offset: number;
  readonly move: (delta: number) => void;
  readonly jumpTo: (target: 'top' | 'bottom') => void;
}

function useScrollController(
  initialOffset: number,
  maxOffset: number,
  onScrollChange: ((offset: number) => void) | undefined
): ScrollController {
  const [offset, setOffset] = useState(initialOffset);

  useEffect(() => {
    setOffset((cur) => Math.min(cur, maxOffset));
  }, [maxOffset]);

  const maxOffsetRef = useRef(maxOffset);
  maxOffsetRef.current = maxOffset;
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

  return { offset, move, jumpTo };
}

interface ScrollKeysOptions {
  readonly isActive: boolean;
  readonly pageStepRef: RefObject<number>;
  readonly fastScrollLines: number;
  readonly move: (delta: number) => void;
  readonly jumpTo: (target: 'top' | 'bottom') => void;
}

function useScrollKeys({
  isActive,
  pageStepRef,
  fastScrollLines,
  move,
  jumpTo,
}: Readonly<ScrollKeysOptions>): void {
  const dispatch = useCallback(
    (input: string, key: Key) => {
      const page = pageStepRef.current;
      if (handleNavKey(key, page, move)) {
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
    [pageStepRef, move, jumpTo, fastScrollLines]
  );
  useInput(dispatch, { isActive });
}

function useScrollMouse(
  containerRef: RefObject<DOMElement | null>,
  focus: (id: string) => void,
  focusId: string,
  move: (delta: number) => void
): void {
  const onMouse = useCallback(
    (e: MouseEvent) => {
      const bounds = readBounds(containerRef.current);
      if (!bounds || !hitTest(bounds, e)) {
        return;
      }
      if (e.button === 'left' && e.action === 'click') {
        focus(focusId);
        return;
      }
      if (e.action === 'scroll' && (e.button === 'wheelUp' || e.button === 'wheelDown')) {
        move(e.button === 'wheelUp' ? -3 : 3);
      }
    },
    [containerRef, focus, focusId, move]
  );
  useMouse(onMouse);
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
  const containerActive = useFocusActive();
  const { isFocused } = useFocus({
    autoFocus: autoFocus && containerActive,
    id: focusId,
    isActive: focusable && containerActive,
  });
  const { focus } = useFocusManager();

  // Subscribed for the side-effect: re-render on terminal resize so
  // `useMeasure` re-measures and `visibleRows` updates immediately.
  useTerminalSize();

  const [windowRef, windowSize] = useMeasure();
  // `windowRef` lives on the content sub-box inside the scroll row —
  // already a sibling of the status / actions rows, so its measured
  // height excludes them. No need to subtract anything; doing so eats
  // a row and was the source of layout drift on resize.
  const visibleRows = height
    ? Math.max(MIN_HEIGHT, height)
    : Math.max(MIN_HEIGHT, windowSize.height);

  // Detect the sliceable shape once per `children` identity — splitting
  // a 1000-line README on every keystroke was the dominant scroll cost.
  const sliceable = useMemo(() => detectSliceable(children), [children]);
  const [innerRef, innerSize] = useMeasure();
  const totalRows = sliceable ? sliceable.totalLines : Math.max(innerSize.height, visibleRows);
  const maxOffset = Math.max(0, totalRows - visibleRows);

  const { offset, move, jumpTo } = useScrollController(initialOffset, maxOffset, onScrollChange);

  const pageStepRef = useRef(MIN_PAGE);
  pageStepRef.current = Math.max(MIN_PAGE, visibleRows - 1);

  useScrollKeys({ isActive: isFocused, pageStepRef, fastScrollLines, move, jumpTo });

  const containerRef = useRef<DOMElement>(null);
  useScrollMouse(containerRef, focus, focusId, move);

  const state: ScrollState = { offset, totalRows, height: visibleRows, focused: isFocused };
  const chrome = renderStatus(statusLine, state, accent);

  const body = renderBody(sliceable, children, offset, visibleRows, innerRef);
  const actions =
    isFocused && !sliceable
      ? renderActions(offset, maxOffset, jumpTo)
      : null;

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
      {actions}
      {chrome ? <Box flexShrink={0}>{chrome}</Box> : null}
    </Box>
  );
}

function renderBody(
  sliceable: Sliceable | null,
  children: ReactNode,
  offset: number,
  visibleRows: number,
  innerRef: RefObject<DOMElement | null>
): ReactNode {
  if (sliceable) {
    const sliced = sliceable.slice(offset, offset + visibleRows);
    return React.cloneElement(sliceable.element, sliced);
  }
  return (
    <Box ref={innerRef} flexDirection="column" flexShrink={0} marginTop={-offset}>
      {children}
    </Box>
  );
}

function renderActions(
  offset: number,
  maxOffset: number,
  jumpTo: (target: 'top' | 'bottom') => void
): React.ReactElement {
  const atTop = offset === 0;
  const atBottom = offset >= maxOffset;
  return (
    <Box flexShrink={0}>
      <Button shortcut="g" enabled={!atTop} onPress={() => jumpTo('top')}>
        top
      </Button>
      <Button shortcut="G" enabled={!atBottom} onPress={() => jumpTo('bottom')}>
        bottom
      </Button>
    </Box>
  );
}

function handleNavKey(key: Key, page: number, move: (delta: number) => void): boolean {
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
  return Math.min(Math.max(value, min), max);
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
  const position = totalRows === 0 ? '0 / 0' : `${offset + 1}–${end} / ${totalRows}`;
  const pct =
    totalRows <= height ? 100 : Math.round((offset / Math.max(1, totalRows - height)) * 100);
  // Slim 10-cell progress bar — same visual language as common shells
  // ([████····· 40%]), gives the user a quick "where am I" cue without
  // having to read the row numbers.
  const barCells = 10;
  const filled = Math.max(0, Math.min(barCells, Math.round((pct / 100) * barCells)));
  const bar = '█'.repeat(filled) + '·'.repeat(barCells - filled);
  const arrows = `${atTop ? '·' : '↑'}${atBot ? '·' : '↓'}`;
  return (
    <Text dimColor>
      <Text color={focused ? accent : undefined} bold={focused}>
        {arrows}
      </Text>
      <Text>{` ${position}  `}</Text>
      <Text color={focused ? accent : undefined}>{bar}</Text>
      <Text>{` ${pct}%`}</Text>
      {focused ? (
        <Text>{'  ·  ↑↓ scroll · PgUp/PgDn page · g/G top/bot · Tab leave'}</Text>
      ) : (
        <Text>{'  ·  Tab / click to scroll'}</Text>
      )}
    </Text>
  );
}
