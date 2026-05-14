/**
 * Arrow-nav single-select. One option per line, the focused one
 * marked with `◆`. Enter submits, Esc cancels.
 *
 * Always renders its own `useInput`; pass `focused={false}` to
 * suspend keyboard handling without unmounting (so a parent wizard
 * can step through fields cleanly).
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

export interface SelectInputProps {
  readonly options: ReadonlyArray<SelectOption>;
  readonly value?: string;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
  readonly focused?: boolean;
}

export function SelectInput({
  options,
  value,
  onSubmit,
  onCancel,
  focused = true,
}: Readonly<SelectInputProps>): React.ReactElement {
  const initial = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const [index, setIndex] = useState(initial);
  const current = options[index] ?? options[0];

  useInput(
    (_input, key) => {
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.return) {
        if (current) {
          onSubmit?.(current.value);
        }
        return;
      }
      if (key.upArrow) {
        setIndex((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (key.downArrow) {
        setIndex((i) => (i + 1) % options.length);
      }
    },
    { isActive: focused }
  );

  return (
    <Box flexDirection="column">
      {options.map((opt, i) => {
        const active = i === index;
        return (
          <Box key={opt.value}>
            <Text color={active ? 'cyan' : 'gray'}>{active ? '◆ ' : '○ '}</Text>
            <Text color={active ? 'cyan' : undefined} bold={active}>
              {opt.label}
            </Text>
            {opt.hint && <Text dimColor> {opt.hint}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
