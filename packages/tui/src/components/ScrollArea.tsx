/**
 * `<ScrollArea>` — focus-aware scrollable wrapper. Wrap any tall block
 * of content in one and it becomes a windowed view with keyboard
 * scroll controls:
 *
 *   <ScrollArea height={20}>
 *     <Markdown source={readme} />
 *   </ScrollArea>
 *
 * Focus model:
 *   - Tab into the area or click it to grab scroll keys.
 *   - `↑` / `↓` / `j` / `k`     — one line up / down
 *   - `J` / `K`                  — fast scroll (5 lines at a time)
 *   - `PageUp` / `PageDown`      — one page (height − 1 lines)
 *   - `Ctrl+U` / `Ctrl+D`        — same (Mac-keyboard friendly)
 *   - `Home` / `g` / `Ctrl+B`    — jump to top
 *   - `End`  / `G` / `Ctrl+G`    — jump to bottom
 *   - `Esc`                      — release focus
 *
 * **Event isolation.** While focused, the area calls
 * `useCaptureInput()` so every plain `useKey` outside any `<KeyScope>`
 * suspends — section-jump hotkeys (1-8), `/`, `q`, etc. don't fire
 * while the user is scrolling. The area's own scroll keybinds live
 * inside a `<KeyScope>` so they bypass that suspend and keep firing.
 *
 * How the scroll works: children render at their natural height inside
 * an outer Box that's clipped to `height` rows. A negative `marginTop`
 * on the inner Box shifts the children up by `offset` rows. The inner
 * Box's measured height (via `useMeasure`) tells us the upper bound so
 * the cursor never scrolls past the last screenful.
 *
 * A status row at the bottom shows where the cursor is ("12-31 / 84 ·
 * Esc to exit" while focused). Pass `statusLine={null}` to hide it.
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import type React from 'react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { KeyScope } from '../keys/KeyScope';
import { useKey } from '../keys/useKey';
import { hitTest, readBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';
import { useCaptureInput } from '../shell/useTuiShell';
import { useMeasure } from '../state/useMeasure';

export interface ScrollAreaProps {
  /** Explicit visible row count. Omit to fill the flex parent — the
   *  pane will measure its own height and use that as the window
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
  /** Lines per Shift+arrow / `J` / `K` press. Default `5`. */
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
  /** Rendered content height in rows. */
  readonly contentHeight: number;
  /** Visible window size. */
  readonly height: number;
  readonly focused: boolean;
}

/**
 * Outer wrapper. Renders a `<KeyScope>` so the inner component's
 * `useKey` hooks bypass the shell's capture-suspend mechanism — every
 * external `useKey` outside a scope auto-suspends when we call
 * `useCaptureInput(true)` from the inner, but ours keeps firing.
 */
export function ScrollArea(props: Readonly<ScrollAreaProps>): React.ReactElement {
  return (
    <KeyScope>
      <ScrollAreaInner {...props} />
    </KeyScope>
  );
}

const MIN_HEIGHT = 1;
/** Floor for page-step size before the first measurement lands. Keeps
 *  the very first PageDown from advancing only a single line. */
const MIN_PAGE = 10;

const HOME_SEQUENCES: ReadonlySet<string> = new Set(['[H', '[1~', 'OH']);
const END_SEQUENCES: ReadonlySet<string> = new Set(['[F', '[4~', 'OF']);

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

  const [innerRef, innerSize] = useMeasure();
  const [windowRef, windowSize] = useMeasure();
  const STATUS_ROWS = statusLine === null ? 0 : 1;
  const visibleRows = height
    ? Math.max(MIN_HEIGHT, height)
    : Math.max(MIN_HEIGHT, windowSize.height - STATUS_ROWS);
  const contentHeight = innerSize.height;
  const maxOffset = Math.max(0, contentHeight - visibleRows);

  const [offset, setOffset] = useState(initialOffset);

  // Re-clamp whenever content shrinks under the cursor.
  useEffect(() => {
    setOffset((cur) => (cur > maxOffset ? maxOffset : cur));
  }, [maxOffset]);

  // Stash live values in refs so the keybind closures don't capture
  // stale offset / max / page — that's the source of the "double-press
  // does nothing" pagination bug.
  const maxOffsetRef = useRef(maxOffset);
  maxOffsetRef.current = maxOffset;
  const pageStepRef = useRef(MIN_PAGE);
  pageStepRef.current = Math.max(MIN_PAGE, visibleRows - 1);

  const onChangeRef = useRef(onScrollChange);
  onChangeRef.current = onScrollChange;

  /** Move by `delta` lines using the state-updater pattern so we read
   *  the latest offset on every press — no stale-closure issues even
   *  if React batches several presses into one render. */
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

  // Line / fast / page / jump keybinds. All read pageStepRef.current
  // at handler-fire time so the first frame doesn't move 1 line on
  // PgDn just because windowSize hasn't measured yet.
  //
  // Note: `useKey`'s matcher discriminates printable keys by the
  // literal char (Ink reports uppercase as `K`, not as `k` with
  // shift). A `shift+k` spec would *also* fire on plain `k` and the
  // two handlers would stack — that's the "j press scrolls 6 lines"
  // and "g jumps to bottom" bug. Use the uppercase form directly.
  useKey('upArrow', () => move(-1), isFocused);
  useKey('downArrow', () => move(1), isFocused);
  useKey('k', () => move(-1), isFocused);
  useKey('j', () => move(1), isFocused);
  useKey('K', () => move(-fastScrollLines), isFocused);
  useKey('J', () => move(fastScrollLines), isFocused);
  useKey('pageUp', () => move(-pageStepRef.current), isFocused);
  useKey('pageDown', () => move(pageStepRef.current), isFocused);
  useKey('ctrl+u', () => move(-pageStepRef.current), isFocused);
  useKey('ctrl+d', () => move(pageStepRef.current), isFocused);
  useKey('g', () => jumpTo('top'), isFocused);
  useKey('G', () => jumpTo('bottom'), isFocused);
  useKey('ctrl+b', () => jumpTo('top'), isFocused);
  useKey('ctrl+g', () => jumpTo('bottom'), isFocused);
  useKey('escape', () => focusNext(), isFocused);

  // Home / End — Ink doesn't expose these as `key.*` flags, so we match
  // the raw escape sequences via `useInput`.
  useInput(
    (input) => {
      if (HOME_SEQUENCES.has(input)) {
        jumpTo('top');
      } else if (END_SEQUENCES.has(input)) {
        jumpTo('bottom');
      }
    },
    { isActive: isFocused }
  );

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

  const state: ScrollState = { offset, contentHeight, height: visibleRows, focused: isFocused };
  const chrome = renderStatus(statusLine, state, accent);

  const windowProps = height
    ? { height: visibleRows }
    : { flexGrow: 1, flexBasis: 0 as const, flexShrink: 1 };

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
      <Box ref={windowRef} overflow="hidden" {...windowProps}>
        {/* `flexShrink=0` keeps Yoga from collapsing the inner Box's
         *  height when its negative marginTop pushes the bottom past
         *  the parent's bounds — otherwise `measureElement` reports a
         *  shrinking total as the user scrolls. */}
        <Box ref={innerRef} flexDirection="column" flexShrink={0} marginTop={-offset}>
          {children}
        </Box>
      </Box>
      {chrome ? <Box flexShrink={0}>{chrome}</Box> : null}
    </Box>
  );
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
  const { offset, contentHeight, height, focused } = state;
  const end = Math.min(contentHeight, offset + height);
  const atTop = offset === 0;
  const atBot = end >= contentHeight;
  const position = contentHeight === 0 ? '0/0' : `${offset + 1}-${end}/${contentHeight}`;
  const pct =
    contentHeight <= height
      ? '100%'
      : `${Math.round((offset / Math.max(1, contentHeight - height)) * 100)}%`;
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
