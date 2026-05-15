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
 * Captures global input (via `useCaptureInput`) so shell hotkeys
 * stay muted while the input is mounted.
 *
 * Variants pick the leading-glyph: `search` (`> `), `password`
 * (masked with `•`), `plain` (no prefix).
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
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
  /** Tint for the cursor + border when active. Default `cyan`. */
  readonly accentColor?: string;
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
}: Readonly<InputProps>): React.ReactElement {
  useCaptureInput();

  useInput((input, key) => {
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
  });

  const display = kind === 'password' ? '•'.repeat(value.length) : value;
  const showPlaceholder = value.length === 0 && Boolean(placeholder);

  const body = (
    <Box>
      {PREFIX_BY_KIND[kind] ? <Text color={accentColor}>{PREFIX_BY_KIND[kind]}</Text> : null}
      {showPlaceholder ? <Text dimColor>{placeholder}</Text> : <Text>{display}</Text>}
      <Text color={accentColor}>▏</Text>
    </Box>
  );

  if (border) {
    return (
      <Box borderStyle="round" borderColor={accentColor} paddingX={1}>
        {body}
      </Box>
    );
  }
  return body;
}
