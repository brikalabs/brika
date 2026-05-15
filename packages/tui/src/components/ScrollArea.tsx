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
 *   - `↑` / `↓`             — one line up / down
 *   - `PageUp` / `PageDown` — one page (height − 1 lines)
 *   - `Ctrl+U` / `Ctrl+D`   — one page (Mac-keyboard friendly)
 *   - `Ctrl+B`              — jump to top
 *   - `Ctrl+G`              — jump to bottom
 *   - `Esc`                 — release focus (hands it to the next focusable)
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

import { Box, type DOMElement, Text, useFocus, useFocusManager } from 'ink';
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

function ScrollAreaInner({
  height,
  children,
  initialOffset = 0,
  autoFocus = false,
  id,
  focusable = true,
  onScrollChange,
  statusLine,
  accent = 'cyan',
}: Readonly<ScrollAreaProps>): React.ReactElement {
  const autoId = useId();
  const focusId = id ?? `scrollarea-${autoId}`;
  const { isFocused } = useFocus({ autoFocus, id: focusId, isActive: focusable });
  const { focus, focusNext } = useFocusManager();

  // While focused, suspend every plain `useKey` (i.e. those outside a
  // KeyScope) so section-jump hotkeys / quick filters / etc. don't
  // double-fire alongside the scroll keys.
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

  const onChangeRef = useRef(onScrollChange);
  onChangeRef.current = onScrollChange;

  const setClamped = useCallback(
    (next: number) => {
      setOffset((cur) => {
        const clamped = clamp(next, 0, maxOffset);
        if (clamped !== cur) {
          onChangeRef.current?.(clamped);
        }
        return clamped;
      });
    },
    [maxOffset]
  );

  const page = Math.max(1, visibleRows - 1);
  useKey('upArrow', () => setClamped(offset - 1), isFocused);
  useKey('downArrow', () => setClamped(offset + 1), isFocused);
  useKey('pageUp', () => setClamped(offset - page), isFocused);
  useKey('pageDown', () => setClamped(offset + page), isFocused);
  useKey('ctrl+u', () => setClamped(offset - page), isFocused);
  useKey('ctrl+d', () => setClamped(offset + page), isFocused);
  useKey('ctrl+b', () => setClamped(0), isFocused);
  useKey('ctrl+g', () => setClamped(maxOffset), isFocused);
  useKey('escape', () => focusNext(), isFocused);

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
      borderStyle={isFocused ? 'round' : 'single'}
      borderColor={isFocused ? accent : 'gray'}
      paddingX={1}
    >
      <Box ref={windowRef} overflow="hidden" {...windowProps}>
        <Box ref={innerRef} flexDirection="column" marginTop={-offset}>
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
  const arrows = `${atTop ? '·' : '↑'} ${atBot ? '·' : '↓'}`;
  return (
    <Text dimColor>
      <Text color={focused ? accent : undefined}>{arrows}</Text>
      <Text>{`  ${position}`}</Text>
      {focused ? <Text>{'  ·  Esc to exit'}</Text> : <Text>{'  ·  Tab to scroll'}</Text>}
    </Text>
  );
}
