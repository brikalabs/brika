/**
 * `<Input>` — single-line text input.
 *
 *   const [q, setQ] = useState('');
 *   <Input value={q} onChange={setQ} placeholder="Search…"
 *          onSubmit={() => fetchResults(q)}
 *          onCancel={() => setQ('')} />
 *
 * Minimal API — like shadcn's `<Input>`, the component owns *only*
 * the typing field. Label / hint / error text live in sibling
 * elements at the call site:
 *
 *   <Text dimColor>Query</Text>
 *   <Input value={q} onChange={setQ} />
 *   {err ? <Text color="red">{err}</Text> : null}
 *
 * **Focus-aware.** Plugged into ink's native `useFocus` so `Tab` /
 * `Shift+Tab` cycles between mounted Inputs and `<Button>`s
 * automatically. When focused the border lights up cyan and the
 * shell's `useCaptureInput` flag turns on so global hotkeys
 * suspend. When NOT focused (sibling element has focus instead)
 * the input is dim and keystrokes don't land here.
 *
 * `autoFocus` defaults to `true` for the common single-input-on-
 * screen case (search picker, filter draft, …). Set `false` if you
 * want the user to land on something else first.
 *
 * Variants pick the leading-glyph: `search` (`> `), `password`
 * (masked with `•`), `plain` (no prefix).
 */

import { Box, type DOMElement, Text, useFocus, useFocusManager, useInput } from 'ink';
import type React from 'react';
import { useCallback, useRef } from 'react';
import { hitTest, useBounds } from '../mouse/useBounds';
import { useMouse } from '../mouse/useMouse';
import { useCaptureInput } from '../shell/useTuiShell';

export type InputKind = 'search' | 'password' | 'plain';

export interface InputProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
  readonly placeholder?: string;
  readonly kind?: InputKind;
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

const PREFIX_BY_KIND: Readonly<Record<InputKind, string>> = {
  search: '> ',
  password: '* ',
  plain: '',
};

export function Input({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  kind = 'search',
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

  // Mouse: clicking the input focuses it (no separate `onPress` —
  // typing follows once focused). Ignore clicks outside the box.
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

  const display = kind === 'password' ? '•'.repeat(value.length) : value;
  const showPlaceholder = value.length === 0 && Boolean(placeholder);
  const borderColor = isFocused ? accentColor : 'gray';
  const prefixColor = isFocused ? accentColor : undefined;

  const body = (
    <Box>
      {PREFIX_BY_KIND[kind] ? <Text color={prefixColor}>{PREFIX_BY_KIND[kind]}</Text> : null}
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
