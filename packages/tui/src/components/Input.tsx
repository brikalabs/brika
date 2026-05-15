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
 *   <Input type="search" value={q} onChange={setQ} />
 *   {err ? <Text color="red">{err}</Text> : null}
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
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
}

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
}: Readonly<InputProps>): React.ReactElement {
  const { isFocused } = useFocus({ autoFocus, id });
  const { focus } = useFocusManager();
  const boxRef = useRef<DOMElement>(null);
  const bounds = useBounds(boxRef);

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
      if (!bounds || e.button !== 'left' || e.action !== 'down') {
        return;
      }
      if (hitTest(bounds, e) && id) {
        focus(id);
      }
    },
    [bounds, focus, id]
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
    { isActive: isFocused }
  );

  const display = type === 'password' ? '•'.repeat(value.length) : value;
  const showPlaceholder = value.length === 0 && Boolean(placeholder);
  const borderColor = isFocused ? accentColor : 'gray';
  const prefixColor = isFocused ? accentColor : undefined;
  const prefix = PREFIX_BY_TYPE[type];

  const body = (
    <Box>
      {prefix ? <Text color={prefixColor}>{prefix}</Text> : null}
      {showPlaceholder ? <Text dimColor>{placeholder}</Text> : <Text>{display}</Text>}
      {isFocused ? <Text color={accentColor}>▏</Text> : null}
    </Box>
  );

  if (border) {
    return (
      <Box ref={boxRef} borderStyle="round" borderColor={borderColor} paddingX={1}>
        {body}
      </Box>
    );
  }
  return <Box ref={boxRef}>{body}</Box>;
}
