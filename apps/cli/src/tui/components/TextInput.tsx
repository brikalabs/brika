/**
 * Minimal text input for inline forms. Reads keystrokes via ink's
 * `useInput`, maintains its own buffer, and renders a one-line caret
 * styled like the rest of the brika TUI.
 *
 *   <TextInput
 *     value={name}
 *     onChange={setName}
 *     onSubmit={onSubmit}
 *     placeholder="full name"
 *   />
 *
 * Active inputs always show the caret; pass `focused={false}` to
 * suspend keyboard handling (e.g. when another input is focused).
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';

export interface TextInputProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
  readonly placeholder?: string;
  readonly focused?: boolean;
  readonly label?: string;
  readonly mask?: boolean;
}

export function TextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  focused = true,
  label,
  mask,
}: Readonly<TextInputProps>): React.ReactElement {
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
      if (input && !key.ctrl && !key.meta) {
        onChange(value + input);
      }
    },
    { isActive: focused }
  );

  const display = mask ? '•'.repeat(value.length) : value;
  return (
    <Box>
      {label && (
        <Box width={14}>
          <Text dimColor>{label}</Text>
        </Box>
      )}
      <Text>
        {value.length === 0 && placeholder ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <Text>{display}</Text>
        )}
        {focused && <Text color="yellow">█</Text>}
      </Text>
    </Box>
  );
}
