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
 *     flex
 *   />
 *
 * While focused, the Input calls `useCaptureInput()` so any plain
 * `useShortcut` in the surrounding tree auto-suspends (typing `q`
 * never quits the app). Wrap a sibling region in `<KeyScope>` when
 * its shortcuts should keep firing during typing (e.g. `<Search>`
 * binds `↑` / `↓` over the results list).
 *
 * **Props** (shadcn / HTML shape):
 *   - `value` / `onChange`  — controlled string + setter.
 *   - `placeholder`         — dim text shown when value is empty.
 *   - `type`                — `'text'` (default, no prefix),
 *                             `'password'` (masked with `•`),
 *                             `'search'` (leading `> `).
 *   - `onFocus` / `onBlur`  — focus state callbacks.
 *   - `onSubmit`            — fires on Enter with the current value.
 *   - `onCancel`            — fires on Esc.
 *   - `autoFocus`           — default `true`; grab focus on mount.
 *   - `id`                  — stable id for ink's focus manager.
 *   - `maxLength`           — cap on value length. Default 256.
 *   - `border`              — draw a rounded border. Default `true`.
 *   - `accentColor`         — focused border / cursor tint.
 *   - `flex` / `width`      — sizing.
 *   - `disabled`            — refuse focus + typing.
 *   - `prefix`              — custom prefix text override.
 *   - `focused`             — controlled focus mode (Form fields).
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useFocusActive } from '../keys/FocusActive';
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
  readonly maxLength?: number;
  readonly border?: boolean;
  readonly accentColor?: string;
  readonly autoFocus?: boolean;
  readonly id?: string;
  readonly flex?: boolean;
  readonly width?: number | string;
  readonly disabled?: boolean;
  readonly prefix?: string;
  readonly focused?: boolean;
}

const CURSOR_BLINK_MS: number = 530;

const PREFIX_BY_TYPE: Readonly<Record<InputType, string>> = {
  text: '',
  password: '* ',
  // `⌕` (U+2315 TELEPHONE RECORDER) reads as a magnifier glyph in
  // every monospace font we've checked — same visual language as the
  // web UI's `<Search>` icon, so users get a consistent "this is a
  // search field" cue across the two surfaces.
  search: '⌕ ',
};

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
 *  printable. One ink `useInput` covers them all. */
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
  const autoId = useId();
  const focusId = id ?? autoId;
  // Gate ink's focus on the surrounding `<FocusActive>` so a hidden
  // tab-panel Input doesn't steal the autoFocus claim.
  const containerActive = useFocusActive();
  const native = useFocus({
    autoFocus: !isControlled && autoFocus && !disabled && containerActive,
    id: focusId,
    isActive: !isControlled && !disabled && containerActive,
  });
  const isFocused = !disabled && (isControlled ? focused : native.isFocused);
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);
  const bounds = useBounds(boxRef);

  // Suspend sibling `useShortcut`s while we own the keyboard. No-op
  // when the Input isn't focused, or when running outside a shell.
  useCaptureInput(isFocused);

  const cursorOn = useCursorBlink(isFocused);
  useFireFocusEvents(isFocused, onFocus, onBlur);

  // Mouse: click anywhere on the input focuses it.
  const handleMouse = useCallback(
    (e: MouseEvent) => {
      if (isControlled || disabled || e.button !== 'left' || e.action !== 'down') {
        return;
      }
      const b = readBounds(boxRef.current);
      if (b && hitTest(b, e)) {
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
  const cursor = showCursor ? (
    <Text color={accentColor} inverse>
      {' '}
    </Text>
  ) : (
    <Text> </Text>
  );

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
