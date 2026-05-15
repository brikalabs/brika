/**
 * `<Input>` — single-line text input. The canonical TUI text field;
 * every typing surface in `@brika/tui` consumers ends up here.
 *
 *   const [q, setQ] = useState('');
 *   <Input
 *     type="search"
 *     value={q}
 *     onChange={setQ}
 *     placeholder="Search…"
 *     onSubmit={() => fetchResults(q)}
 *     onFocus={() => setHelpHint('typing — Esc clears')}
 *     flex               // take all remaining row width
 *   />
 *
 * **Props** (shadcn / HTML shape):
 *   - `value`        — controlled string value.
 *   - `onChange`     — `(next: string) => void`.
 *   - `placeholder`  — dim text shown when value is empty.
 *   - `type`         — `'text'` (default, no prefix), `'password'`
 *                      (masked with `•`), `'search'` (leading `> `).
 *   - `onFocus`      — fires when the input gains keyboard focus.
 *   - `onBlur`       — fires when the input loses focus.
 *   - `onSubmit`     — fires on Enter with the current value.
 *   - `onCancel`     — fires on Esc.
 *   - `autoFocus`    — default `true`; grab focus on mount.
 *   - `id`           — stable id for ink's focus manager + mouse hit
 *                      targeting (multiple inputs need unique ids).
 *   - `maxLength`    — cap on value length. Default 256.
 *   - `border`       — draw a rounded border. Default `true`.
 *   - `accentColor`  — focused border / cursor tint. Default `cyan`.
 *
 * **Sizing**:
 *   - `flex`         — `flexGrow: 1`. Use inside a horizontal `<Box>`
 *                      to stretch across remaining space.
 *   - `width`        — fixed cell count (`width={40}`) or a layout
 *                      string (`width="50%"`). Overrides natural
 *                      content sizing.
 *   - default        — content-sized (just wide enough for the
 *                      current value + cursor + prefix + border).
 *
 * Long values:
 *   When the live width can't fit the value, the visible window
 *   scrolls so the caret column stays inside the box. The full
 *   value still lives in `value`/`onChange` — it's only the
 *   displayed prefix/suffix that gets clipped.
 *
 * Interactions:
 *   - **Keyboard**: typing letters appends to `value`; Backspace
 *     pops; Enter → `onSubmit`; Esc → `onCancel`. Tab / Shift+Tab
 *     cycle focus across all mounted Inputs and Buttons (ink's
 *     native focus manager).
 *   - **Mouse**: left-click on the input focuses it.
 *
 * Layout convention (shadcn / HTML): label and hint live OUTSIDE
 * the input as plain `<Text>` siblings so consumers compose freely.
 *
 *   <Text dimColor>Query</Text>
 *   <Input type="search" value={q} onChange={setQ} flex />
 *   {err ? <Text color="red">{err}</Text> : null}
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { hitTest, readBounds, useBounds } from '../mouse/useBounds';
import { type MouseEvent, useMouse } from '../mouse/useMouse';
import { useCaptureInput } from '../shell/useTuiShell';

export type InputType = 'text' | 'password' | 'search';

export interface InputProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder?: string;
  readonly type?: InputType;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
  /** Cap on the value length. Default 256. */
  readonly maxLength?: number;
  /** Frame the input in a rounded border. Default `true`. */
  readonly border?: boolean;
  /** Tint for the cursor + border when focused. Default `cyan`. */
  readonly accentColor?: string;
  /** Grab focus on mount. Default `true`. */
  readonly autoFocus?: boolean;
  /** Stable id for ink's focus manager — only needed when multiple
   *  inputs are mounted and you want to control the cycle order. */
  readonly id?: string;
  /** `flexGrow: 1` shortcut — stretch to fill the parent row. */
  readonly flex?: boolean;
  /** Explicit width: a fixed cell count, or a layout string ("50%"). */
  readonly width?: number | string;
  /** When `true`, the input refuses focus, dims its chrome, and
   *  ignores typing / mouse clicks. Default `false`. */
  readonly disabled?: boolean;
  /** Custom prefix text rendered before the value — overrides the
   *  `type`-default glyph. Use plain text or emoji (`'🔍 '`,
   *  `'$ '`, `'»'`, …). Pass empty string to suppress the default. */
  readonly prefix?: string;
  /** Controlled focus. When defined, the Input ignores Ink's focus
   *  manager entirely — `useFocus` makes no claim and `useInput`
   *  follows the prop. Use this when an outer container (e.g. the
   *  Form engine) drives focus and the Input should defer. */
  readonly focused?: boolean;
}

/** Cursor blink period (ms). `0` keeps the cursor solid. */
const CURSOR_BLINK_MS: number = 530;

const PREFIX_BY_TYPE: Readonly<Record<InputType, string>> = {
  text: '',
  password: '* ',
  search: '> ',
};

/** Cursor visibility — toggles every `CURSOR_BLINK_MS` while focused,
 *  solid (always on) when blurred. Pulling this out keeps the Input
 *  function under Biome's cognitive-complexity ceiling. */
function useCursorBlink(isFocused: boolean): boolean {
  const [cursorOn, setCursorOn] = useState(true);
  useEffect(() => {
    if (!isFocused || CURSOR_BLINK_MS === 0) {
      setCursorOn(true);
      return;
    }
    const t = setInterval(() => setCursorOn((on) => !on), CURSOR_BLINK_MS);
    return () => clearInterval(t);
  }, [isFocused]);
  return cursorOn;
}

interface KeystrokesOptions {
  readonly value: string;
  readonly isActive: boolean;
  readonly maxLength: number;
  readonly onChange: (next: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
}

/** Single-line text editing keystrokes — Esc / Enter / Backspace /
 *  printable. Lives outside the Input function so the cognitive-
 *  complexity counter doesn't fold all these branches into Input's
 *  score. */
function useKeystrokes({
  value,
  isActive,
  maxLength,
  onChange,
  onSubmit,
  onCancel,
}: KeystrokesOptions): void {
  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        onSubmit?.(value);
        return;
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        if (value.length >= maxLength) {
          return;
        }
        onChange(value + input);
      }
    },
    { isActive }
  );
}

interface Chrome {
  readonly borderColor: string;
  readonly prefixColor?: string;
  readonly prefixDim: boolean;
  readonly placeholderColor?: string;
}

/** Map (focus, disabled) into the input's visible chrome — border /
 *  prefix / placeholder colours. Disabled wins; otherwise focused
 *  inputs pick up the accent. Pulled out so Input itself doesn't
 *  juggle three coupled ternaries inline. */
function computeChrome(isFocused: boolean, disabled: boolean, accentColor: string): Chrome {
  const accent = !disabled && isFocused;
  let placeholderColor: string | undefined;
  if (!disabled) {
    placeholderColor = isFocused ? accentColor : 'gray';
  }
  return {
    borderColor: accent ? accentColor : 'gray',
    prefixColor: accent ? accentColor : undefined,
    prefixDim: disabled || !isFocused,
    placeholderColor,
  };
}

interface ScrollMetrics {
  readonly width: number;
}

/** Horizontal-scroll slice of the (masked) value. Returns the value
 *  unchanged when no width was pinned, or when it already fits — so
 *  content-sized inputs grow naturally with their value. */
function computeDisplay(
  masked: string,
  bounds: ScrollMetrics | null,
  canScroll: boolean,
  border: boolean,
  prefixLen: number
): string {
  if (!canScroll || !bounds) {
    return masked;
  }
  const innerWidth = Math.max(0, bounds.width - (border ? 4 : 0) - prefixLen - 1);
  if (innerWidth <= 0 || masked.length <= innerWidth) {
    return masked;
  }
  return masked.slice(masked.length - innerWidth);
}

/** Fire `onFocus` / `onBlur` as the resolved focus state flips. The
 *  ref dance keeps the callbacks fresh without making them dep-stable. */
function useFireFocusEvents(
  isFocused: boolean,
  onFocus: (() => void) | undefined,
  onBlur: (() => void) | undefined
): void {
  const focusedRef = useRef(false);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;
  useEffect(() => {
    if (isFocused && !focusedRef.current) {
      focusedRef.current = true;
      onFocusRef.current?.();
    } else if (!isFocused && focusedRef.current) {
      focusedRef.current = false;
      onBlurRef.current?.();
    }
  }, [isFocused]);
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  onFocus,
  onBlur,
  onSubmit,
  onCancel,
  maxLength = 256,
  border = true,
  accentColor = 'cyan',
  autoFocus = true,
  id,
  flex = false,
  width,
  disabled = false,
  prefix,
  focused,
}: Readonly<InputProps>): React.ReactElement {
  const isControlled = focused !== undefined;
  // Auto-assign a stable focus id when the caller didn't provide one
  // so click-to-focus always works. Without this an `<Input>` that's
  // not given an `id` couldn't be activated by mouse — only the
  // global Tab cycle would land on it.
  const autoId = useId();
  const focusId = id ?? autoId;
  const native = useFocus({
    autoFocus: !isControlled && autoFocus && !disabled,
    id: focusId,
    isActive: !isControlled && !disabled,
  });
  const isFocused = !disabled && (isControlled ? focused : native.isFocused);
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);
  // Reactive bounds — Input genuinely needs the live box dimensions
  // for `computeDisplay` to slice the visible window of the string.
  // Mouse clicks read bounds on-demand below (cheap + separate).
  const bounds = useBounds(boxRef);

  // Blink the cursor while focused; capture input + fire focus
  // events as the resolved focus state flips.
  const cursorOn = useCursorBlink(isFocused);
  useCaptureInput(isFocused);
  useFireFocusEvents(isFocused, onFocus, onBlur);

  // Mouse: clicking the input focuses it. Skipped in controlled
  // mode — the outer container (Form) owns hit-testing for its rows.
  // Bounds are read on-demand so this hook adds no per-render work.
  const handleMouse = useCallback(
    (e: MouseEvent) => {
      if (isControlled || disabled || e.button !== 'left' || e.action !== 'down') {
        return;
      }
      const bounds = readBounds(boxRef.current);
      if (bounds && hitTest(bounds, e)) {
        focus(focusId);
      }
    },
    [isControlled, disabled, focus, focusId]
  );
  useMouse(handleMouse);

  useKeystrokes({
    value,
    isActive: isFocused && !disabled,
    maxLength,
    onChange,
    onSubmit,
    onCancel,
  });

  const masked = type === 'password' ? '•'.repeat(value.length) : value;
  const showPlaceholder = value.length === 0 && Boolean(placeholder);
  const resolvedPrefix = prefix ?? PREFIX_BY_TYPE[type];
  const { borderColor, prefixColor, prefixDim, placeholderColor } = computeChrome(
    isFocused,
    disabled,
    accentColor
  );
  const display = computeDisplay(
    masked,
    bounds,
    flex || width !== undefined,
    border,
    resolvedPrefix.length
  );

  const showCursor = isFocused && !disabled && cursorOn;

  // Inverse-block cursor — a solid cell that contrasts against
  // whatever's underneath. Hidden when blinking-off so the eye
  // can track typing without the cursor masking the last char.
  const cursor = showCursor ? (
    <Text color={accentColor} inverse>
      {' '}
    </Text>
  ) : (
    <Text> </Text>
  );

  // Cursor position rule:
  //   - placeholder visible (empty value)  → cursor at column 0,
  //     before the dim placeholder text.
  //   - value present                      → cursor trails the
  //     displayed value (typing position).
  const content = showPlaceholder ? (
    <>
      {cursor}
      <Text color={placeholderColor} dimColor={!isFocused || disabled}>
        {placeholder}
      </Text>
    </>
  ) : (
    <>
      <Text dimColor={disabled}>{display}</Text>
      {cursor}
    </>
  );

  const body = (
    <Box>
      {resolvedPrefix ? (
        <Text color={prefixColor} dimColor={prefixDim}>
          {resolvedPrefix}
        </Text>
      ) : null}
      {content}
    </Box>
  );

  return (
    <Box
      ref={boxRef}
      borderStyle={border ? 'round' : undefined}
      borderColor={border ? borderColor : undefined}
      paddingX={border ? 1 : 0}
      flexGrow={flex ? 1 : undefined}
      width={width}
    >
      {body}
    </Box>
  );
}
