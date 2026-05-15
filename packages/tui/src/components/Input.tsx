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
import { useCallback, useEffect, useRef, useState } from 'react';
import { hitTest, useBounds } from '../mouse/useBounds';
import { useMouse } from '../mouse/useMouse';
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
}

/** Cursor blink period (ms). `0` keeps the cursor solid. */
const CURSOR_BLINK_MS: number = 530;

const PREFIX_BY_TYPE: Readonly<Record<InputType, string>> = {
  text: '',
  password: '* ',
  search: '> ',
};

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
}: Readonly<InputProps>): React.ReactElement {
  const { isFocused } = useFocus({ autoFocus: autoFocus && !disabled, id, isActive: !disabled });
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);
  const bounds = useBounds(boxRef);

  // Blink the cursor while focused so the user knows the input is
  // actively listening. Solid (no blink) is also fine — set
  // `CURSOR_BLINK_MS = 0` to keep it on always.
  const [cursorOn, setCursorOn] = useState(true);
  useEffect(() => {
    if (!isFocused || CURSOR_BLINK_MS === 0) {
      setCursorOn(true);
      return;
    }
    const t = setInterval(() => setCursorOn((on) => !on), CURSOR_BLINK_MS);
    return () => clearInterval(t);
  }, [isFocused]);

  // Capture input only while focused — siblings (other inputs,
  // buttons) get a clean shell when Tab moves focus away.
  useCaptureInput(isFocused);

  // Fire onFocus / onBlur as focus state flips. Refs hide rendering
  // jitter (handlers don't need to be stable to avoid loops).
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

  // Mouse: clicking the input focuses it. Ignore clicks outside box.
  const handleMouse = useCallback(
    (e: { action: string; button: string; column: number; row: number }) => {
      if (disabled || !bounds || e.button !== 'left' || e.action !== 'down') {
        return;
      }
      if (hitTest(bounds, e) && id) {
        focus(id);
      }
    },
    [disabled, bounds, focus, id]
  );
  useMouse(handleMouse);

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
    { isActive: isFocused && !disabled }
  );

  const masked = type === 'password' ? '•'.repeat(value.length) : value;
  const showPlaceholder = value.length === 0 && Boolean(placeholder);
  const resolvedPrefix = prefix ?? PREFIX_BY_TYPE[type];

  // Visual states:
  //   - disabled    → everything muted; no cursor.
  //   - focused     → accent border + accent prefix + accent cursor.
  //   - resting     → soft gray border, dim prefix, no cursor.
  const borderColor = disabled ? 'gray' : isFocused ? accentColor : 'gray';
  const prefixColor = disabled ? undefined : isFocused ? accentColor : undefined;
  const prefixDim = disabled || !isFocused;
  const placeholderColor = disabled ? undefined : isFocused ? accentColor : 'gray';

  // Horizontal scroll: when the box has a measured width that
  // can't fit the full value (+ prefix + cursor + border padding),
  // slice the value so the cursor stays at the right edge.
  const innerWidth = bounds
    ? Math.max(0, bounds.width - (border ? 4 : 0) - resolvedPrefix.length - 1)
    : null;
  const display =
    innerWidth !== null && masked.length > innerWidth
      ? masked.slice(masked.length - innerWidth)
      : masked;

  const showCursor = isFocused && !disabled && cursorOn;

  const body = (
    <Box>
      {resolvedPrefix ? (
        <Text color={prefixColor} dimColor={prefixDim}>
          {resolvedPrefix}
        </Text>
      ) : null}
      {showPlaceholder ? (
        <Text color={placeholderColor} dimColor={!isFocused || disabled}>
          {placeholder}
        </Text>
      ) : (
        <Text dimColor={disabled}>{display}</Text>
      )}
      {/* Inverse-block cursor — a solid cell that contrasts against
          whatever's underneath. Hidden when blinking-off so the eye
          can track typing without the cursor masking the last char. */}
      {showCursor ? (
        <Text color={accentColor} inverse>
          {' '}
        </Text>
      ) : (
        <Text> </Text>
      )}
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
